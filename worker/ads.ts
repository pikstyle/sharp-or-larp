import type { Context } from 'hono'
import { findRecentCheck, type SavedCheck } from './checks.ts'
import {
  ApiError,
  type Ad,
  type AdCheckoutResponse,
  type AdRequest,
  type AdText,
  type AdsResponse,
} from './types.ts'
import { toWebUrl } from './web.ts'

type AppContext = Context<{ Bindings: Env }>

type NewAd = AdText & SavedCheck & { imageId: string | null }

const AD_SLOTS = 8
const AD_DAYS = 7
const AD_PRICE_CENTS = 1000
const DAY_MS = 24 * 60 * 60 * 1000
const NAME_MAX_CHARS = 40
const HEADLINE_MAX_CHARS = 80
const URL_MAX_CHARS = 200
const IMAGE_MAX_BYTES = 100 * 1024
const UNUSED_IMAGE_MAX_AGE_MS = DAY_MS
const SIGNATURE_TOLERANCE_S = 300
const CHECKOUT_MINUTES = 31
const PAID_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded']
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const BASE64 = /^[a-z\d+/]+={0,2}$/i
const JPEG_START = '\xff\xd8\xff'

// Lists the ads that are paid for and still running, oldest first.
export async function listAds(c: AppContext) {
  const { results } = await c.env.DB.prepare(
    `SELECT name, headline, link_url AS url, larp_percent AS larpPercent,
       github_login AS githubLogin, image_id AS imageId
     FROM ads WHERE expires_at > ? ORDER BY created_at ASC LIMIT ?`,
  )
    .bind(Date.now(), AD_SLOTS)
    .all<Omit<Ad, 'imageUrl'> & { imageId: string | null }>()

  const ads: Ad[] = results.map(({ imageId, ...ad }) => ({
    ...ad,
    imageUrl: imageId ? `/api/ads/images/${imageId}` : null,
  }))
  const response: AdsResponse = {
    ads,
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

// Accepts any public https link (LinkedIn, a startup, a site) and tidies it.
function readAdLink(value: unknown): string | null {
  const text = readText(value, URL_MAX_CHARS)
  const url = text ? toWebUrl(text) : null

  if (!url) {
    return null
  }
  url.protocol = 'https:'
  return url.href.length <= URL_MAX_CHARS ? url.href : null
}

// Checks the optional image: a small JPEG made in the browser, in base64.
function readAdImage(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const isBase64 = typeof value === 'string' && value.length % 4 === 0 && BASE64.test(value)
  const fits = isBase64 && value.length >= 8 && value.length <= Math.ceil(IMAGE_MAX_BYTES / 3) * 4

  if (!fits || !atob(value.slice(0, 8)).startsWith(JPEG_START)) {
    throw new ApiError(400, 'invalid_ad')
  }
  return value
}

// Checks the ad form: a name, a headline, a link, an image and the check's id.
async function readAdRequest(c: AppContext): Promise<AdRequest> {
  const body = await c.req.json().catch(() => null)
  const name = readText(body?.name, NAME_MAX_CHARS)
  const headline = readText(body?.headline, HEADLINE_MAX_CHARS)
  const url = readAdLink(body?.url)
  const checkId = readText(body?.checkId, 36)

  if (!name || !headline || !url) {
    throw new ApiError(400, 'invalid_ad')
  }
  if (!checkId || !UUID.test(checkId)) {
    throw new ApiError(400, 'check_expired')
  }
  return { name, headline, url, checkId, imageJpeg: readAdImage(body?.imageJpeg) }
}

// Counts the ads currently on display.
async function countActiveAds(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM ads WHERE expires_at > ?')
    .bind(Date.now())
    .first<{ count: number }>()
  return row?.count ?? 0
}

// Sends a form to a Stripe API endpoint and returns its JSON answer.
async function postToStripe<T>(
  path: string,
  form: URLSearchParams,
  secretKey: string,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }

  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers,
    body: form,
  })
  const body = await response.json<T & { error?: unknown }>()

  if (!response.ok) {
    console.error(`Stripe refused ${path}`, response.status, body.error)
    throw new ApiError(502, 'stripe_failed')
  }
  return body
}

// Keeps an ad's image until the ad runs, and clears images no ad uses.
async function saveAdImage(db: D1Database, jpegBase64: string): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()

  await db.batch([
    db
      .prepare(
        `DELETE FROM ad_images WHERE created_at < ? AND id NOT IN
         (SELECT image_id FROM ads WHERE image_id IS NOT NULL AND expires_at > ?)`,
      )
      .bind(now - UNUSED_IMAGE_MAX_AGE_MS, now),
    db
      .prepare('INSERT INTO ad_images (id, jpeg_base64, created_at) VALUES (?, ?, ?)')
      .bind(id, jpegBase64, now),
  ])
  return id
}

// Asks Stripe for a payment page for one ad slot and returns its address.
async function createStripeCheckout(ad: NewAd, origin: string, secretKey: string) {
  const form = new URLSearchParams({
    mode: 'payment',
    'managed_payments[enabled]': 'false',
    success_url: `${origin}/?ad=success`,
    cancel_url: `${origin}/?ad=cancelled`,
    expires_at: String(Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60),
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(AD_PRICE_CENTS),
    'line_items[0][price_data][product_data][name]': `Sharp or Larp ad slot (${AD_DAYS} days)`,
    'metadata[name]': ad.name,
    'metadata[headline]': ad.headline,
    'metadata[link_url]': ad.url,
    'metadata[larp_percent]': String(ad.larpPercent),
  })
  if (ad.githubLogin) {
    form.set('metadata[github_login]', ad.githubLogin)
  }
  if (ad.imageId) {
    form.set('metadata[image_id]', ad.imageId)
  }

  const session = await postToStripe<{ url?: string }>('checkout/sessions', form, secretKey)

  if (!session.url) {
    throw new ApiError(502, 'stripe_failed')
  }
  return session.url
}

// Starts buying an ad slot: checks the ad and sends back Stripe's page URL.
export async function createAdCheckout(c: AppContext) {
  const { checkId, imageJpeg, ...text } = await readAdRequest(c)
  const check = await findRecentCheck(c.env.DB, checkId)

  if (!check) {
    throw new ApiError(400, 'check_expired')
  }
  if ((await countActiveAds(c.env.DB)) >= AD_SLOTS) {
    throw new ApiError(409, 'ads_sold_out')
  }

  const imageId = imageJpeg ? await saveAdImage(c.env.DB, imageJpeg) : null
  const ad: NewAd = { ...text, ...check, imageId }
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

type StripeSession = {
  id: string
  payment_status?: string
  payment_intent?: string | null
  metadata?: {
    name?: string
    headline?: string
    link_url?: string
    linkedin_url?: string
    larp_percent?: string
    github_login?: string
    image_id?: string
  }
}

type StripeEvent = {
  type: string
  data: { object: StripeSession }
}

// Returns the ad of a fully paid checkout, or null for any other event.
function readPaidAd(event: StripeEvent): NewAd | null {
  const session = event.data.object
  const meta = session.metadata
  const url = readAdLink(meta?.link_url ?? meta?.linkedin_url)
  const larpPercent = Number(meta?.larp_percent)
  const githubLogin = meta?.github_login ?? ''
  const imageId = meta?.image_id ?? ''

  if (
    !PAID_EVENTS.includes(event.type) ||
    session.payment_status !== 'paid' ||
    !meta?.name ||
    !meta.headline ||
    !url ||
    !Number.isInteger(larpPercent) ||
    larpPercent < 0 ||
    larpPercent > 100
  ) {
    return null
  }
  return {
    name: meta.name,
    headline: meta.headline,
    url,
    larpPercent,
    githubLogin: GITHUB_LOGIN.test(githubLogin) ? githubLogin : null,
    imageId: UUID.test(imageId) ? imageId : null,
  }
}

// Saves a paid ad if a slot is free; false means every slot is taken.
async function publishAd(db: D1Database, sessionId: string, ad: NewAd): Promise<boolean> {
  const now = Date.now()
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO ads
       (stripe_session_id, name, headline, link_url, larp_percent, github_login, image_id,
        created_at, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, (SELECT id FROM ad_images WHERE id = ?), ?, ?
       WHERE (SELECT COUNT(*) FROM ads WHERE expires_at > ?) < ?`,
    )
    .bind(
      sessionId,
      ad.name,
      ad.headline,
      ad.url,
      ad.larpPercent,
      ad.githubLogin,
      ad.imageId,
      now,
      now + AD_DAYS * DAY_MS,
      now,
      AD_SLOTS,
    )
    .run()

  if (result.meta.changes > 0) {
    return true
  }
  const existing = await db
    .prepare('SELECT 1 FROM ads WHERE stripe_session_id = ?')
    .bind(sessionId)
    .first()
  return existing !== null
}

// Gives the buyer their money back when every slot was taken before they paid.
async function refundSoldOutAd(session: StripeSession, secretKey: string) {
  if (!session.payment_intent) {
    console.error('Sold-out ad paid without a payment intent', session.id)
    return
  }
  const form = new URLSearchParams({
    payment_intent: session.payment_intent,
    'metadata[reason]': 'ads_sold_out',
  })
  await postToStripe('refunds', form, secretKey, `refund-${session.id}`)
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
  const ad = readPaidAd(event)

  if (ad && !(await publishAd(c.env.DB, session.id, ad))) {
    await refundSoldOutAd(session, c.env.STRIPE_SECRET_KEY)
  }
  return c.json({ received: true })
}

// Sends the image of a running ad; it never changes, so browsers keep it.
export async function serveAdImage(c: AppContext) {
  const id = c.req.param('id') ?? ''
  const row = UUID.test(id)
    ? await c.env.DB.prepare(
        `SELECT i.jpeg_base64 AS jpeg FROM ad_images i JOIN ads a ON a.image_id = i.id
         WHERE i.id = ? AND a.expires_at > ?`,
      )
        .bind(id, Date.now())
        .first<{ jpeg: string }>()
    : null

  if (!row) {
    throw new ApiError(404, 'not_found')
  }
  const bytes = Uint8Array.from(atob(row.jpeg), (char) => char.charCodeAt(0))
  return c.body(bytes, 200, {
    'Content-Type': 'image/jpeg',
    'Cache-Control': `public, max-age=${AD_DAYS * 24 * 60 * 60}, immutable`,
  })
}
