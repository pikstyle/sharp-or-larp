import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type CvInput = {
  text: string
  links: string[]
}

export type LinkCheck = {
  url: string
  status: 'ok' | 'dead' | 'skipped'
  note: string | null
}

export type SiteVisit = {
  url: string
  status: 'ok' | 'dead'
  note: string | null
  pages: { url: string; text: string }[]
}

export type ReadmeStyle = {
  badges: number
  widgets: number
  images: number
  emojis: number
  templatePhrases: number
}

export type GithubEvidence = {
  profile: {
    login: string
    bio: string | null
    websiteUrl: string | null
    linkedinOnProfile: boolean
    accountAgeDays: number
    followers: number
    following: number
    profileReadme: string | null
    readmeStyle: ReadmeStyle
  }
  website: SiteVisit | null
  repos: {
    own: number
    forks: number
    empty: number
    totalStars: number
    list: {
      name: string
      description: string | null
      language: string | null
      stars: number
      commits: number
    }[]
  }
  activity: {
    contributionsLastYear: number
    activeWeeksLastYear: number
    busiestMonthPercent: number
    maxReposCreatedSameWeek: number
  }
  suspectedAutoCommits: {
    repo: string
    percentOfYearCommits: number
    identicalMessagePercent: number
  } | null
  mergedPRsElsewhere: {
    count: number
    examples: { repo: string; repoStars: number; title: string }[]
  }
  showcase: {
    name: string
    description: string | null
    pinned: boolean
    linkedFromCv: boolean
    isFork: boolean
    language: string | null
    stars: number
    forks: number
    issuesByOthers: number
    commits: number
    commitsByThem: number
    aiCommitPercent: number
    builtWith: string | null
    createdAt: string
    lastPushAt: string | null
    readmeExcerpt: string | null
  }[]
}

export type Dossier = {
  github: GithubEvidence | null
  cv: { text: string; links: LinkCheck[] } | null
}

export type Verdict = {
  larpPercent: number
  redFlags: string[]
  greenFlags: string[]
  roast: string
}

export type AnalyzeResponse = {
  checkId: string | null
  login: string | null
  avatarUrl: string | null
  verdict: Verdict
}

export type AdText = {
  name: string
  headline: string
  url: string
}

export type Ad = AdText & {
  larpPercent: number | null
  githubLogin: string | null
  imageUrl: string | null
}

export type AdRequest = AdText & {
  checkId: string
  imageJpeg: string | null
}

export type AdsResponse = {
  ads: Ad[]
  slots: number
  priceUsd: number
  days: number
}

export type AdCheckoutResponse = {
  url: string
}

// An error that carries the HTTP status and error code to answer with.
export class ApiError extends Error {
  status: ContentfulStatusCode
  code: string

  constructor(status: ContentfulStatusCode, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}
