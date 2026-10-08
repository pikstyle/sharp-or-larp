import type { CvInput, Dossier, LinkCheck } from './types.ts'
import { checkLink, toWebUrl } from './web.ts'

const MAX_LINKS_FOLLOWED = 5
const CV_TEXT_MAX_CHARS = 12000
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i
const GITHUB_PAGES = ['orgs', 'sponsors', 'features', 'topics', 'apps', 'marketplace', 'settings']

export type CvLinkPlan = {
  repoNames: string[]
  toFetch: string[]
  skipped: LinkCheck[]
}

// Finds the GitHub account a CV points to, preferring a profile link.
export function findGithubLoginInCv(links: string[]): string | null {
  const owners = links.flatMap((link) => {
    const url = toWebUrl(link)
    const [owner, repo] = url?.pathname.split('/').filter(Boolean) ?? []
    const isGithub = url?.hostname.replace(/^www\./, '') === 'github.com'
    const isAccount = owner && GITHUB_LOGIN.test(owner) && !GITHUB_PAGES.includes(owner)
    return isGithub && isAccount ? [{ owner, isProfile: !repo }] : []
  })

  return (owners.find((found) => found.isProfile) ?? owners[0])?.owner ?? null
}

// Sorts the CV's links: their own repos, sites to open, and links to skip.
export function planCvLinks(links: string[], login: string | null): CvLinkPlan {
  const plan: CvLinkPlan = { repoNames: [], toFetch: [], skipped: [] }
  const ownLogin = login?.toLowerCase()

  for (const link of new Set(links)) {
    const url = toWebUrl(link)
    if (!url) {
      continue
    }

    const host = url.hostname.replace(/^www\./, '')
    const [owner, repo] = url.pathname.split('/').filter(Boolean).map((s) => s.toLowerCase())

    if (host === 'github.com' && owner === ownLogin) {
      if (repo) {
        plan.repoNames.push(`${owner}/${repo}`)
      }
    } else if (host === 'github.com') {
      plan.skipped.push({ url: url.href, status: 'skipped', note: 'another GitHub account' })
    } else if (host.endsWith('linkedin.com')) {
      plan.skipped.push({ url: url.href, status: 'skipped', note: 'LinkedIn needs a login' })
    } else if (plan.toFetch.length < MAX_LINKS_FOLLOWED && !plan.toFetch.includes(url.href)) {
      plan.toFetch.push(url.href)
    }
  }
  return plan
}

// Opens every link the plan says to follow, all at the same time.
export async function fetchCvLinks(plan: CvLinkPlan | null): Promise<LinkCheck[]> {
  return Promise.all((plan?.toFetch ?? []).map(checkLink))
}

// Builds the CV block: its text plus what we found behind each link.
export function buildCv(
  cv: CvInput | null,
  plan: CvLinkPlan | null,
  fetched: LinkCheck[],
): Dossier['cv'] {
  if (!cv || !plan) {
    return null
  }
  return {
    text: cv.text.slice(0, CV_TEXT_MAX_CHARS),
    links: [...fetched, ...plan.skipped],
  }
}
