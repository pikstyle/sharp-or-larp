import type { ContentfulStatusCode } from 'hono/utils/http-status'

export type Dossier = {
  profile: {
    login: string
    bio: string | null
    accountAgeDays: number
    followers: number
    following: number
    profileReadme: string | null
  }
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
    pinned: boolean
    isFork: boolean
    language: string | null
    stars: number
    forks: number
    issuesByOthers: number
    commits: number
    createdAt: string
    lastPushAt: string | null
    readmeExcerpt: string | null
  }[]
}

export type AnalyzeResponse = {
  login: string
  avatarUrl: string
  dossier: Dossier
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
