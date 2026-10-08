import type { Context, Next } from 'hono'
import { ApiError } from './types.ts'

type AppContext = Context<{ Bindings: Env }>

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const SITEVERIFY_TIMEOUT_MS = 10_000
const TOKEN_MAX_CHARS = 2048

type SiteverifyResult = {
  success?: boolean
  action?: string
  hostname?: string
}

// Identifies a visitor by the IP address Cloudflare saw them come from.
function visitorKey(c: AppContext): string {
  return c.req.header('cf-connecting-ip') ?? 'local'
}

// Asks a rate limiter if this key may go on, or refuses with a 429.
async function enforce(limiter: RateLimit, key: string) {
  const { success } = await limiter.limit({ key })

  if (!success) {
    throw new ApiError(429, 'too_many_requests')
  }
}

// Caps every visitor at a reasonable number of API calls per minute.
export async function limitApiCalls(c: AppContext, next: Next) {
  await enforce(c.env.API_LIMITER, visitorKey(c))
  await next()
}

// Caps analyses per visitor and in total, since each one costs an LLM call.
export async function limitAnalyses(c: AppContext, next: Next) {
  await enforce(c.env.ANALYZE_LIMITER, visitorKey(c))
  await enforce(c.env.GLOBAL_ANALYZE_LIMITER, 'all')
  await next()
}

// Caps how often a visitor can open a Stripe payment page.
export async function limitCheckouts(c: AppContext, next: Next) {
  await enforce(c.env.ANALYZE_LIMITER, `checkout:${visitorKey(c)}`)
  await next()
}

// Asks Cloudflare if a Turnstile token is valid, for this action and this site.
async function isHuman(c: AppContext, token: unknown, action: string): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX_CHARS) {
    return false
  }

  const response = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: c.env.TURNSTILE_SECRET,
      response: token,
      remoteip: c.req.header('cf-connecting-ip') ?? '',
    }),
    signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
  }).catch(() => null)
  const result = await response?.json<SiteverifyResult>().catch(() => null)

  return (
    response?.ok === true &&
    result?.success === true &&
    result.action === action &&
    result.hostname === new URL(c.req.url).hostname
  )
}

// Lets an analysis through only with a fresh Turnstile token from our page.
export async function requireHuman(c: AppContext, next: Next) {
  const body = await c.req.json().catch(() => null)

  if (!(await isHuman(c, body?.turnstileToken, 'analyze'))) {
    throw new ApiError(403, 'bot_check_failed')
  }
  await next()
}

// Accepts only JSON sent by our own site, which blocks other sites' forms.
export async function requireOwnSiteJson(c: AppContext, next: Next) {
  const origin = c.req.header('origin')
  const isJson = c.req.header('content-type')?.startsWith('application/json')

  if (!isJson || (origin && origin !== new URL(c.req.url).origin)) {
    throw new ApiError(403, 'forbidden')
  }
  await next()
}

// Answers a too-big request body with our usual JSON error.
export function bodyTooLarge(): never {
  throw new ApiError(413, 'body_too_large')
}
