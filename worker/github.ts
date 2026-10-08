import { ApiError } from './types.ts'

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'
const GITHUB_ATTEMPTS = 2
const SHOWCASE_SIZE = 5
const COMMIT_COUNT_BATCH = 25

// Extracts the GitHub username from a profile link, a repo link or a bare name.
export function parseGithubLogin(input: string): string {
  const withoutDomain = input
    .trim()
    .replace(/^@/, '')
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
  const login = withoutDomain.split(/[/?#]/)[0]

  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login)) {
    throw new ApiError(400, 'invalid_github')
  }
  return login
}

type GraphqlResult<T> = {
  data?: T
  errors?: { type?: string }[]
}

// Posts a query to GitHub, once more if it times out (it gives up after 10 s).
async function postToGithub(body: string, token: string): Promise<Response | null> {
  for (let attempt = 1; attempt <= GITHUB_ATTEMPTS; attempt++) {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'sharp-or-larp',
      },
      body,
    }).catch(() => null)

    if (response && response.status < 500) {
      return response
    }
    console.error('GitHub did not answer, attempt', attempt, response?.status)
  }
  return null
}

// Sends a GraphQL query to GitHub and returns the data it answers with.
async function queryGithub<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<T> {
  const response = await postToGithub(JSON.stringify({ query, variables }), token)

  if (response?.status === 403 || response?.status === 429) {
    console.error('GitHub refused: rate limit', response.status)
    throw new ApiError(503, 'github_rate_limited')
  }
  if (!response?.ok) {
    console.error('GitHub answered with status', response?.status)
    throw new ApiError(502, 'github_failed')
  }

  const result = await response.json<GraphqlResult<T>>()
  const realErrors = result.errors?.filter((error) => error.type !== 'NOT_FOUND')

  if (realErrors?.some((error) => error.type === 'RATE_LIMITED')) {
    console.error('GitHub refused: rate limit', realErrors)
    throw new ApiError(503, 'github_rate_limited')
  }
  if (realErrors?.length || !result.data) {
    console.error('GitHub answered with errors', result.errors)
    throw new ApiError(502, 'github_failed')
  }
  return result.data
}

const OVERVIEW_QUERY = `
  fragment RepoFields on Repository {
    id
    name
    nameWithOwner
    isFork
    description
    primaryLanguage { name }
    stargazerCount
    forkCount
    createdAt
    pushedAt
  }

  query Overview($login: String!) {
    user(login: $login) {
      id
      login
      avatarUrl(size: 200)
      bio
      websiteUrl
      socialAccounts(first: 10) {
        nodes { provider url }
      }
      createdAt
      followers { totalCount }
      following { totalCount }
      profileReadme: repository(name: $login) {
        object(expression: "HEAD:README.md") {
          ... on Blob { text }
        }
      }
      ownRepos: repositories(
        first: 100
        isFork: false
        ownerAffiliations: OWNER
        privacy: PUBLIC
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        totalCount
        nodes { ...RepoFields }
      }
      forks: repositories(isFork: true, ownerAffiliations: OWNER, privacy: PUBLIC) {
        totalCount
      }
      pinnedRepos: pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository { ...RepoFields }
        }
      }
      contributionsCollection {
        totalCommitContributions
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays { date contributionCount }
          }
        }
        commitContributionsByRepository(maxRepositories: 1) {
          repository { id nameWithOwner }
          contributions { totalCount }
        }
      }
    }
  }
`

export type GithubRepo = {
  id: string
  name: string
  nameWithOwner: string
  isFork: boolean
  description: string | null
  primaryLanguage: { name: string } | null
  stargazerCount: number
  forkCount: number
  createdAt: string
  pushedAt: string | null
}

export type GithubOverview = {
  id: string
  login: string
  avatarUrl: string
  bio: string | null
  websiteUrl: string | null
  socialAccounts: { nodes: { provider: string; url: string }[] }
  createdAt: string
  followers: { totalCount: number }
  following: { totalCount: number }
  profileReadme: { object: { text: string | null } | null } | null
  ownRepos: { totalCount: number; nodes: GithubRepo[] }
  forks: { totalCount: number }
  pinnedRepos: { nodes: GithubRepo[] }
  contributionsCollection: {
    totalCommitContributions: number
    contributionCalendar: {
      totalContributions: number
      weeks: { contributionDays: { date: string; contributionCount: number }[] }[]
    }
    commitContributionsByRepository: {
      repository: { id: string; nameWithOwner: string }
      contributions: { totalCount: number }
    }[]
  }
}

// Fetches everything GitHub can tell us about this user in one query.
export async function fetchGithubOverview(
  login: string,
  token: string,
): Promise<GithubOverview> {
  const data = await queryGithub<{ user: GithubOverview | null }>(
    OVERVIEW_QUERY,
    { login },
    token,
  )

  if (!data.user) {
    throw new ApiError(404, 'github_user_not_found')
  }
  return data.user
}

export type ReposToInspect = {
  showcase: GithubRepo[]
  ids: string[]
}

// Picks showcase repos: pinned, then linked from the CV, then most starred.
export function pickReposToInspect(
  overview: GithubOverview,
  cvRepoNames: string[],
): ReposToInspect {
  const ownRepos = overview.ownRepos.nodes
  const linkedFromCv = ownRepos.filter((repo) =>
    cvRepoNames.includes(repo.nameWithOwner.toLowerCase()),
  )
  const mostStarred = [...ownRepos].sort((a, b) => b.stargazerCount - a.stargazerCount)
  const showcase: GithubRepo[] = []

  for (const repo of [...overview.pinnedRepos.nodes, ...linkedFromCv, ...mostStarred]) {
    if (showcase.length === SHOWCASE_SIZE) {
      break
    }
    if (!showcase.some((picked) => picked.id === repo.id)) {
      showcase.push(repo)
    }
  }

  const ids = showcase.map((repo) => repo.id)
  const topCommitRepo =
    overview.contributionsCollection.commitContributionsByRepository[0]?.repository

  if (topCommitRepo && !ids.includes(topCommitRepo.id)) {
    ids.push(topCommitRepo.id)
  }
  return { showcase, ids }
}

const COMMIT_COUNTS_QUERY = `
  query CommitCounts($ids: [ID!]!) {
    repos: nodes(ids: $ids) {
      ... on Repository {
        id
        defaultBranchRef {
          target {
            ... on Commit { history(first: 1) { totalCount } }
          }
        }
      }
    }
  }
`

type CommitCounts = {
  repos: ({
    id: string
    defaultBranchRef: { target: { history: { totalCount: number } } } | null
  } | null)[]
}

// Counts each repo's commits in small batches: GitHub times out on 100 at once.
export async function fetchCommitCounts(
  repos: GithubRepo[],
  token: string,
): Promise<Map<string, number>> {
  const batches: string[][] = []
  for (let start = 0; start < repos.length; start += COMMIT_COUNT_BATCH) {
    batches.push(repos.slice(start, start + COMMIT_COUNT_BATCH).map((repo) => repo.id))
  }

  const answers = await Promise.all(
    batches.map((ids) => queryGithub<CommitCounts>(COMMIT_COUNTS_QUERY, { ids }, token)),
  )
  const counts = new Map<string, number>()

  for (const repo of answers.flatMap((answer) => answer.repos)) {
    if (repo) {
      counts.set(repo.id, repo.defaultBranchRef?.target.history.totalCount ?? 0)
    }
  }
  return counts
}

const DETAILS_QUERY = `
  query Details($ids: [ID!]!, $prQuery: String!, $userId: ID!) {
    repos: nodes(ids: $ids) {
      ... on Repository {
        nameWithOwner
        readme: object(expression: "HEAD:README.md") {
          ... on Blob { text }
        }
        issues(first: 20, orderBy: { field: CREATED_AT, direction: DESC }) {
          nodes { author { login } }
        }
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 50) {
                totalCount
                nodes {
                  message
                  author { name user { login } }
                }
              }
              byThem: history(first: 1, author: { id: $userId }) { totalCount }
            }
          }
        }
      }
    }
    mergedPRs: search(query: $prQuery, type: ISSUE, first: 20) {
      issueCount
      nodes {
        ... on PullRequest {
          title
          repository { nameWithOwner stargazerCount }
        }
      }
    }
  }
`

export type GithubCommit = {
  message: string
  author: { name: string | null; user: { login: string } | null } | null
}

export type GithubRepoDetails = {
  nameWithOwner: string
  readme: { text: string | null } | null
  issues: { nodes: { author: { login: string } | null }[] }
  defaultBranchRef: {
    target: {
      history: { totalCount: number; nodes: GithubCommit[] }
      byThem: { totalCount: number }
    }
  } | null
}

export type GithubDetails = {
  repos: (GithubRepoDetails | null)[]
  mergedPRs: {
    issueCount: number
    nodes: {
      title: string
      repository: { nameWithOwner: string; stargazerCount: number }
    }[]
  }
}

// Fetches READMEs, issues and commits of the picked repos, plus merged PRs.
export async function fetchGithubDetails(
  overview: GithubOverview,
  ids: string[],
  token: string,
): Promise<GithubDetails> {
  const prQuery = `author:${overview.login} is:pr is:merged -user:${overview.login}`
  const variables = { ids, prQuery, userId: overview.id }

  return queryGithub<GithubDetails>(DETAILS_QUERY, variables, token)
}
