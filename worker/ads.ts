import type { Context } from 'hono'
import {
  ApiError,
  type Ad,
  type AdCheckoutResponse,
  type AdsResponse,
} from './types.ts'

type AppContext = Context<{ Bindings: Env }>

const AD_SLOTS = 8
const AD_DAYS = 7
const AD_PRICE_CENTS = 1000
const DAY_MS = 24 * 60 * 60 * 1000
const NAME_MAX_CHARS = 40
const HEADLINE_MAX_CHARS = 80
const SIGNATURE_TOLERANCE_S = 300
const LINKEDIN_PROFILE = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[\w\-%]+\/?$/i

// Lists the ads that are paid for and still running, oldest first.
export async function listAds(c: AppContext) {
  const { results } = await c.env.DB.prepare(
    `SELECT name, headline, linkedin_url AS linkedinUrl FROM ads
     WHERE expires_at > ? ORDER BY created_at ASC LIMIT ?`,
  )
    .bind(Date.now(), AD_SLOTS)
    .all<Ad>()

  const response: AdsResponse = {
    ads: results,
    slots: AD_SLOTS,
    priceUsd: AD_PRICE_CENTS / 100,
    days: AD_DAYS,
  }
  return c.json(response, 200, { 'Cache-Control': 'public, max-age=30' })
}

// Trims a form field and checks it is plain text of an acceptable length.
function readText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.replace(/\p{Cc}/gu, ' ').trim()
  return text.length > 0 && text.length <= maxChars ? text : null
}

// Checks the ad form: a LinkedIn profile URL, a name and a short headline.
async function readAdRequest(c: AppContext): Promise<Ad> {
  const body = await c.req.json().catch(() => null)
  const name = readText(body?.name, NAME_MAX_CHARS)
  const headline = readText(body?.headline, HEADLINE_MAX_CHARS)
  const linkedinUrl = readText(body?.linkedinUrl, 200)

  if (!name || !headline || !linkedinUrl || !LINKEDIN_PROFILE.test(linkedinUrl)) {
    throw new ApiError(400, 'invalid_ad')
  }
  return { name, headline, linkedinUrl }
}

// Counts the ads currently on display.
async function countActiveAds(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM ads WHERE expires_at > ?')
    .bind(Date.now())
    .first<{ count: number }>()
  return row?.count ?? 0
}

// Asks Stripe for a payment page for one ad slot and returns its address.
async function createStripeCheckout(ad: Ad, origin: string, secretKey: string) {
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${origin}/?ad=success`,
    cancel_url: `${origin}/?ad=cancelled`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(AD_PRICE_CENTS),
    'line_items[0][price_data][product_data][name]': `sharp-or-larp ad slot (${AD_DAYS} days)`,
    'metadata[name]': ad.name,
    'metadata[headline]': ad.headline,
    'metadata[linkedin_url]': ad.linkedinUrl,
  })

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  const session = await response.json<{ url?: string; error?: unknown }>()

  if (!response.ok || !session.url) {
    console.error('Stripe refused the checkout', response.status, session.error)
    throw new ApiError(502, 'stripe_failed')
  }
  return session.url
}

// Starts buying an ad slot: checks the ad and sends back Stripe's page URL.
export async function createAdCheckout(c: AppContext) {
  const ad = await readAdRequest(c)

  if ((await countActiveAds(c.env.DB)) >= AD_SLOTS) {
    throw new ApiError(409, 'ads_sold_out')
  }

  const origin = new URL(c.req.url).origin
  const response: AdCheckoutResponse = {
    url: await createStripeCheckout(ad, origin, c.env.STRIPE_SECRET_KEY),
  }
  return c.json(response)
}

// Signs a text with the webhook secret the way Stripe does (HMAC SHA-256).
async function signForStripe(text: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(text))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Compares two strings in constant time so timing can't leak the signature.
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let difference = 0
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return difference === 0
}

// Checks that a webhook really comes from Stripe, using its signature header.
async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(',').map((part) => part.split('='))
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1])
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
  const age = Math.abs(Date.now() / 1000 - timestamp)

  if (!Number.isFinite(timestamp) || age > SIGNATURE_TOLERANCE_S) {
    return false
  }
  const expected = await signForStripe(`${timestamp}.${payload}`, secret)
  return signatures.some((signature) => sameText(signature, expected))
}

type StripeEvent = {
  type: string
  data: {
    object: {
      id: string
      payment_status?: string
      metadata?: { name?: string; headline?: string; linkedin_url?: string }
    }
  }
}

// Receives Stripe's payment confirmations and publishes the paid ad.
export async function handleStripeWebhook(c: AppContext) {
  const payload = await c.req.text()
  const header = c.req.header('stripe-signature') ?? ''

  if (!(await verifyStripeSignature(payload, header, c.env.STRIPE_WEBHOOK_SECRET))) {
    throw new ApiError(400, 'invalid_signature')
  }

  const event = JSON.parse(payload) as StripeEvent
  const session = event.data.object
  const meta = session.metadata

  if (
    event.type === 'checkout.session.completed' &&
    session.payment_status === 'paid' &&
    meta?.name &&
    meta.headline &&
    meta.linkedin_url &&
    LINKEDIN_PROFILE.test(meta.linkedin_url)
  ) {
    const now = Date.now()
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO ads
       (stripe_session_id, name, headline, linkedin_url, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(session.id, meta.name, meta.headline, meta.linkedin_url, now, now + AD_DAYS * DAY_MS)
      .run()
  }
  return c.json({ received: true })
}
