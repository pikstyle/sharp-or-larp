import type { LinkCheck } from './types.ts'

const PAGE_TIMEOUT_MS = 5000
const PAGE_EXCERPT_MAX_CHARS = 1500

// Turns "github.com/x" or "https://x.dev" into a URL, or null if it isn't web.
export function toWebUrl(link: string): URL | null {
  const trimmed = link.trim()
  const withScheme = /^[a-z]+:/i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(withScheme)
    const isWeb = url.protocol === 'https:' || url.protocol === 'http:'
    const isLocal = url.hostname === 'localhost' || /^[\d.]+$|:/.test(url.hostname)
    const isEmail = url.username !== ''
    return isWeb && !isLocal && !isEmail && url.hostname.includes('.') ? url : null
  } catch {
    return null
  }
}

// Reads the visible text of an HTML page, skipping scripts and styles.
async function extractPageText(response: Response): Promise<string> {
  let text = ''
  let insideSkipped = 0

  await new HTMLRewriter()
    .on('*', {
      element() {
        text += ' '
      },
    })
    .on('script, style, noscript, svg, template', {
      element(element) {
        insideSkipped++
        element.onEndTag(() => {
          insideSkipped--
        })
      },
    })
    .onDocument({
      text(chunk) {
        if (insideSkipped === 0 && text.length < PAGE_EXCERPT_MAX_CHARS * 2) {
          text += chunk.text
        }
      },
    })
    .transform(response)
    .arrayBuffer()

  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PAGE_EXCERPT_MAX_CHARS)
}

// Opens a web page and reports whether it works and what it says.
export async function checkLink(url: string): Promise<LinkCheck> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'sharp-or-larp' },
      redirect: 'follow',
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    })

    if (!response.ok) {
      return { url, status: 'dead', note: `answered ${response.status}` }
    }
    const isHtml = response.headers.get('content-type')?.includes('text/html')
    const note = isHtml ? await extractPageText(response) : null
    return { url, status: 'ok', note: note || null }
  } catch {
    return { url, status: 'dead', note: 'unreachable' }
  }
}
