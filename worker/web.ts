import type { LinkCheck, SiteVisit } from './types.ts'

const PAGE_TIMEOUT_MS = 5000
const PAGE_EXCERPT_MAX_CHARS = 1500
const HOME_TEXT_MAX_CHARS = 2000
const INNER_PAGE_TEXT_MAX_CHARS = 1200
const INNER_PAGES_MAX = 3
const ABOUT_THEM =
  /about|me\b|bio|project|work|portfolio|resume|cv|experience|career|blog|writing|posts?|articles|now|talks|research|publications|products?|apps?|open-?source|uses/i
const NOT_WORTH_READING =
  /contact|privacy|terms|legal|cookie|login|sign-?(in|up)|cart|checkout|rss|feed|tags?\/|categor|\.(pdf|png|jpe?g|gif|svg|webp|zip|xml|json|txt)$/i

type PageLink = {
  href: string
  label: string
}

type OpenedPage = {
  url: string
  ok: boolean
  note: string | null
  text: string
  links: PageLink[]
}

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

// Gives a site's name without "www.", so x.dev and www.x.dev count as one site.
export function siteHost(url: string): string | null {
  return toWebUrl(url)?.hostname.replace(/^www\./, '').toLowerCase() ?? null
}

// Cleans the text pulled from HTML: entities, extra spaces, and its length.
function tidyText(text: string, maxChars: number): string {
  return text
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}

// Reads an HTML page: its description if asked, visible text (title included), links.
async function readHtml(response: Response, maxChars: number, withDescription: boolean) {
  let description = ''
  let body = ''
  let insideSkipped = 0
  const links: PageLink[] = []

  await new HTMLRewriter()
    .on('*', {
      element() {
        body += ' '
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
    .on('meta[name="description"], meta[property="og:description"]', {
      element(element) {
        description ||= element.getAttribute('content') ?? ''
      },
    })
    .on('a[href]', {
      element(element) {
        links.push({ href: element.getAttribute('href') ?? '', label: '' })
      },
      text(chunk) {
        const link = links.at(-1)
        if (link && link.label.length < 80) {
          link.label += chunk.text
        }
      },
    })
    .onDocument({
      text(chunk) {
        if (insideSkipped === 0 && body.length < maxChars * 2) {
          body += chunk.text
        }
      },
    })
    .transform(response)
    .arrayBuffer()

  const parts = [withDescription ? description : '', body].map((part) => tidyText(part, maxChars))
  return { text: tidyText(parts.filter(Boolean).join(' | '), maxChars), links }
}

// Opens a web page and reads it, or says why it couldn't be opened.
async function openPage(
  url: string,
  maxChars: number,
  withDescription = true,
): Promise<OpenedPage> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'sharp-or-larp' },
      redirect: 'follow',
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    })

    if (!response.ok) {
      return { url, ok: false, note: `answered ${response.status}`, text: '', links: [] }
    }
    const isHtml = response.headers.get('content-type')?.includes('text/html')
    const read = isHtml
      ? await readHtml(response, maxChars, withDescription)
      : { text: '', links: [] }
    return { url: response.url || url, ok: true, note: null, ...read }
  } catch {
    return { url, ok: false, note: 'unreachable', text: '', links: [] }
  }
}

// Opens a web page and reports whether it works and what it says.
export async function checkLink(url: string): Promise<LinkCheck> {
  const page = await openPage(url, PAGE_EXCERPT_MAX_CHARS)
  return { url, status: page.ok ? 'ok' : 'dead', note: page.ok ? page.text || null : page.note }
}

// Picks the inner pages most likely to say who they are: about, projects, blog…
function pickInnerPages(home: OpenedPage): string[] {
  const host = siteHost(home.url)
  const homePath = new URL(home.url).pathname.replace(/\/$/, '')
  const seen = new Set<string>()
  const candidates: { url: string; aboutThem: boolean }[] = []

  for (const link of home.links) {
    let url: URL
    try {
      url = new URL(link.href, home.url)
    } catch {
      continue
    }
    const path = url.pathname.replace(/\/$/, '')
    const key = `${url.hostname}${path}`
    const isSameSite = siteHost(url.href) === host && url.protocol.startsWith('http')
    if (!isSameSite || path === homePath || seen.has(key) || NOT_WORTH_READING.test(path)) {
      continue
    }
    seen.add(key)
    url.hash = ''
    candidates.push({ url: url.href, aboutThem: ABOUT_THEM.test(`${path} ${link.label}`) })
  }

  return candidates
    .sort((a, b) => Number(b.aboutThem) - Number(a.aboutThem))
    .slice(0, INNER_PAGES_MAX)
    .map((candidate) => candidate.url)
}

// Visits their personal site: the home page, then up to 3 pages about them.
export async function visitWebsite(url: string): Promise<SiteVisit> {
  const home = await openPage(url, HOME_TEXT_MAX_CHARS)
  if (!home.ok) {
    return { url, status: 'dead', note: home.note, pages: [] }
  }

  const inner = await Promise.all(
    pickInnerPages(home).map((pageUrl) => openPage(pageUrl, INNER_PAGE_TEXT_MAX_CHARS, false)),
  )
  const pages = [home, ...inner]
    .filter((page) => page.ok && page.text)
    .map((page) => ({ url: page.url, text: page.text }))
  return { url, status: 'ok', note: null, pages }
}
