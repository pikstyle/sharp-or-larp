import { useCallback, useEffect, useRef, useState } from 'react'

const TURNSTILE_SITEKEY = '0x4AAAAAAFRzCWhUMk1-oyNg'
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

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

// Runs Cloudflare's bot check in a box and keeps its latest one-use token.
export function useTurnstile(action: string) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

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
          callback: (newToken: string) => setToken(newToken),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        })
      })
      .catch(() => setToken(null))

    return () => {
      cancelled = true
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current)
        widgetId.current = null
      }
    }
  }, [action])

  // Asks for a fresh token: each one is accepted by the server only once.
  const reset = useCallback(() => {
    setToken(null)
    if (widgetId.current) {
      window.turnstile?.reset(widgetId.current)
    }
  }, [])

  return { container, token, reset }
}
