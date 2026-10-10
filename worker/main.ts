import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { createAdCheckout, handleStripeWebhook, listAds, serveAdImage } from './ads.ts'
import { analyze } from './analyze.ts'
import {
  bodyTooLarge,
  limitAnalyses,
  limitApiCalls,
  limitCheckouts,
  limitGlobalAnalyses,
  requireHuman,
  requireOwnSiteJson,
} from './guards.ts'
import { ApiError } from './types.ts'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', secureHeaders())

// Guards run in order: the cheap per-visitor caps first, then the bot check, and only then the
// global caps, so that bots can't exhaust the quota shared by real visitors.
app.post(
  '/api/analyze',
  limitApiCalls,
  requireOwnSiteJson,
  bodyLimit({ maxSize: 128 * 1024, onError: bodyTooLarge }),
  limitAnalyses,
  requireHuman('analyze'),
  limitGlobalAnalyses,
  analyze,
)
app.get('/api/ads', limitApiCalls, listAds)
app.get('/api/ads/images/:id', limitApiCalls, serveAdImage)
app.post(
  '/api/ads/checkout',
  limitApiCalls,
  requireOwnSiteJson,
  bodyLimit({ maxSize: 160 * 1024, onError: bodyTooLarge }),
  limitCheckouts,
  requireHuman('checkout'),
  createAdCheckout,
)
app.post(
  '/api/stripe/webhook',
  bodyLimit({ maxSize: 64 * 1024, onError: bodyTooLarge }),
  handleStripeWebhook,
)

// Turns any error thrown by a route into a JSON answer with its status code.
app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: error.code }, error.status)
  }
  console.error(error)
  return c.json({ error: 'internal_error' }, 500)
})

// Answers unknown API paths with JSON instead of a plain-text 404.
app.notFound((c) => c.json({ error: 'not_found' }, 404))

export default app
