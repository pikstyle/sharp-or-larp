import type { Context, Next } from 'hono'
import { ApiError } from './types.ts'

type AppContext = Context<{ Bindings: Env }>

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
