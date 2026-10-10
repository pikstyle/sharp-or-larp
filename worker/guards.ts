import type { Context, Next } from 'hono'
import { takeDailyAnalysis } from './budget.ts'
import { ApiError } from './types.ts'

type AppContext = Context<{ Bindings: Env }>

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const SITEVERIFY_TIMEOUT_MS = 10_000
const TOKEN_MAX_CHARS = 2048
const IPV6_GROUPS = 8
const IPV6_BLOCK_GROUPS = 4

type SiteverifyResult = {
  success?: boolean
  action?: string
  hostname?: string
  metadata?: { result_with_testing_key?: boolean }
}

// Names the /64 block an IPv6 address belongs to. One home or one phone gets a whole block, so
// counting per address would hand a single visitor billions of keys; counting per block does not.
function ipv6Block(ip: string): string {
  const [head, tail = ''] = ip.split('::')
  const headGroups = head ? head.split(':') : []
  const tailGroups = tail ? tail.split(':') : []
  const missing = Math.max(0, IPV6_GROUPS - headGroups.length - tailGroups.length)
  const groups = [...headGroups, ...Array<string>(missing).fill('0'), ...tailGroups]
  const block = groups.slice(0, IPV6_BLOCK_GROUPS).map((group) => parseInt(group, 16).toString(16))
  return `${block.join(':')}::/64`
}

// Identifies a visitor by the IP address Cloudflare saw them come from, IPv6 by /64 block.
// A shared network (campus, office, phone carrier) shows up as one visitor: keep the per-visitor
// caps generous and let the global caps protect the budget.
function visitorKey(c: AppContext): string {
  const ip = c.req.header('cf-connecting-ip') ?? 'local'
  return ip.includes(':') && !ip.includes('.') ? ipv6Block(ip) : ip
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

// Caps analyses per visitor, so one person or one script can't hog the site.
export async function limitAnalyses(c: AppContext, next: Next) {
  await enforce(c.env.ANALYZE_LIMITER, visitorKey(c))
  await next()
}

// Caps analyses for everyone, since each one costs an LLM call: a burst brake per minute, then
// a daily budget counted once for every Cloudflare location. Runs after the bot check, so that
// requests without a valid Turnstile token can't use up the quota of real visitors.
export async function limitGlobalAnalyses(c: AppContext, next: Next) {
  await enforce(c.env.GLOBAL_ANALYZE_LIMITER, 'all')

  if (!(await takeDailyAnalysis(c.env.DB))) {
    throw new ApiError(429, 'daily_limit_reached')
  }
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
  const hostname = new URL(c.req.url).hostname
  const isLocalTest = hostname === 'localhost' && result?.metadata?.result_with_testing_key === true

  return (
    response?.ok === true &&
    result?.success === true &&
    (isLocalTest || (result.action === action && result.hostname === hostname))
  )
}

// Lets a request through only with a fresh Turnstile token from our page, made for this action.
export function requireHuman(action: string) {
  return async (c: AppContext, next: Next) => {
    const body = await c.req.json().catch(() => null)

    if (!(await isHuman(c, body?.turnstileToken, action))) {
      throw new ApiError(403, 'bot_check_failed')
    }
    await next()
  }
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
