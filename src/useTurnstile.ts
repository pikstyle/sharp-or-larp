import { useCallback, useEffect, useRef, useState } from 'react'

const PROD_SITEKEY = '0x4AAAAAAFRzCWhUMk1-oyNg'
const TEST_SITEKEY = '1x00000000000000000000AA'
const TURNSTILE_SITEKEY = import.meta.env.DEV ? TEST_SITEKEY : PROD_SITEKEY
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const TOKEN_WAIT_MS = 10_000

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

type TokenWaiter = (token: string) => void

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptLoading: Promise<TurnstileApi> | null = null

// Loads Cloudflare's Turnstile script once and gives back its API.
function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject())
    script.onerror = () => {
      scriptLoading = null
      reject(new Error('Turnstile failed to load'))
    }
    document.head.append(script)
  })
  return scriptLoading
}

// Runs Cloudflare's bot check in the background, shown only if it needs a click, and hands out
// its token on demand: a submit that comes before the token is ready waits for it instead of failing.
export function useTurnstile(action: string) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const token = useRef<string | null>(null)
  const waiters = useRef<TokenWaiter[]>([])
  const [needsClick, setNeedsClick] = useState(false)

  useEffect(() => {
    let cancelled = false

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) {
          return
        }
        widgetId.current = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITEKEY,
          action,
          theme: 'dark',
          appearance: 'interaction-only',
          callback: (newToken: string) => {
            token.current = newToken
            for (const waiter of waiters.current) {
              waiter(newToken)
            }
            waiters.current = []
          },
          'expired-callback': () => {
            token.current = null
          },
          'error-callback': () => {
            token.current = null
          },
          'before-interactive-callback': () => setNeedsClick(true),
          'after-interactive-callback': () => setNeedsClick(false),
        })
      })
      .catch(() => {
        token.current = null
      })

    return () => {
      cancelled = true
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current)
        widgetId.current = null
      }
    }
  }, [action])

  // Gives the token right away if Cloudflare has issued one, or waits a few seconds for it.
  // Null means none came: the script is blocked, or Cloudflare refused this visitor.
  const waitForToken = useCallback((): Promise<string | null> => {
    if (token.current) {
      return Promise.resolve(token.current)
    }
    return new Promise((resolve) => {
      const waiter: TokenWaiter = (newToken) => {
        clearTimeout(timer)
        resolve(newToken)
      }
      const timer = setTimeout(() => {
        waiters.current = waiters.current.filter((other) => other !== waiter)
        resolve(null)
      }, TOKEN_WAIT_MS)
      waiters.current.push(waiter)
    })
  }, [])

  // Asks for a fresh token: each one is accepted by the server only once.
  const reset = useCallback(() => {
    token.current = null
    if (widgetId.current) {
      window.turnstile?.reset(widgetId.current)
    }
  }, [])

  return { container, needsClick, waitForToken, reset }
}
