import type {
  AdCheckoutResponse,
  AdRequest,
  AdsResponse,
  AnalyzeResponse,
  CvInput,
} from '../worker/types.ts'

const ERROR_MESSAGES: Record<string, string> = {
  missing_input: 'Add a GitHub link, a CV, or both.',
  invalid_github: "That doesn't look like a GitHub profile link.",
  github_user_not_found: 'No GitHub user with that name.',
  github_failed: 'GitHub is not answering. Try again in a minute.',
  github_rate_limited: 'Too many checks right now. Try again in a few minutes.',
  cv_unreadable: "We couldn't find text in that PDF. Is it a scan?",
  cv_too_long: 'That PDF is too long to be a CV.',
  not_a_cv: "That PDF doesn't look like a CV. Try a CV or a LinkedIn PDF export.",
  bot_check_failed: "We couldn't confirm you're human. Reload the page and try again.",
  too_many_requests: 'Easy there. Wait a minute before checking someone else.',
  llm_failed: 'The LARP meter jammed. Try again.',
  invalid_ad: 'Check the fields: a linkedin.com/in/ link, a name and a short headline.',
  check_expired: 'Your result has expired. Run the check again, then place your ad.',
  ads_sold_out: 'Every ad slot is taken right now. Come back in a few days.',
  stripe_failed: 'Payment is unavailable right now. Try again later.',
  body_too_large: 'That is too much text to send.',
}
const FALLBACK_ERROR = 'Something went wrong. Try again.'

// Turns one of our API error codes into a sentence for the visitor.
export function errorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? FALLBACK_ERROR
}

// Calls one of our API routes and returns its JSON, or throws a readable error.
async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init).catch(() => null)
  const body = await response?.json().catch(() => null)

  if (!response?.ok || !body) {
    throw new Error(errorMessage(body?.error))
  }
  return body as T
}

// Sends a JSON body to one of our API routes.
function postJson<T>(path: string, data: unknown): Promise<T> {
  return callApi<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// Asks the server for the verdict on a GitHub profile, a CV, or both.
export function analyzeProfile(github: string | null, cv: CvInput | null, turnstileToken: string) {
  return postJson<AnalyzeResponse>('/api/analyze', { github, cv, turnstileToken })
}

// Loads the ads currently running and the slot settings.
export function fetchAds() {
  return callApi<AdsResponse>('/api/ads')
}

// Starts paying for an ad and returns the Stripe page to send the visitor to.
export function startAdCheckout(ad: AdRequest) {
  return postJson<AdCheckoutResponse>('/api/ads/checkout', ad)
}
