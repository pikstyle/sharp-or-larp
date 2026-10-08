import { ApiError } from './types.ts'

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'
const SHOWCASE_SIZE = 5

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

// Sends a GraphQL query to GitHub and returns the data it answers with.
async function queryGithub<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<T> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'sharp-or-larp',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    console.error('GitHub answered with status', response.status)
    throw new ApiError(502, 'github_failed')
  }

  const result = await response.json<GraphqlResult<T>>()
  const realErrors = result.errors?.filter((error) => error.type !== 'NOT_FOUND')

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
    defaultBranchRef {
      target {
        ... on Commit { history(first: 1) { totalCount } }
      }
    }
  }

  query Overview($login: String!) {
    user(login: $login) {
      login
      avatarUrl(size: 200)
      bio
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
  defaultBranchRef: { target: { history: { totalCount: number } } } | null
}

export type GithubOverview = {
  login: string
  avatarUrl: string
  bio: string | null
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

// Picks the showcase repos, pinned first, plus the repo with most commits.
export function pickReposToInspect(overview: GithubOverview): ReposToInspect {
  const mostStarred = [...overview.ownRepos.nodes].sort(
    (a, b) => b.stargazerCount - a.stargazerCount,
  )
  const showcase: GithubRepo[] = []

  for (const repo of [...overview.pinnedRepos.nodes, ...mostStarred]) {
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

const DETAILS_QUERY = `
  query Details($ids: [ID!]!, $prQuery: String!) {
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
              history(first: 50) { nodes { messageHeadline } }
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

export type GithubRepoDetails = {
  nameWithOwner: string
  readme: { text: string | null } | null
  issues: { nodes: { author: { login: string } | null }[] }
  defaultBranchRef: {
    target: { history: { nodes: { messageHeadline: string }[] } }
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
  login: string,
  ids: string[],
  token: string,
): Promise<GithubDetails> {
  const prQuery = `author:${login} is:pr is:merged -user:${login}`

  return queryGithub<GithubDetails>(DETAILS_QUERY, { ids, prQuery }, token)
}
