import type { GithubDetails, GithubOverview, GithubRepo } from './github.ts'
import type { Dossier } from './types.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const PROFILE_README_MAX_CHARS = 2000
const SHOWCASE_README_MAX_CHARS = 1500
const EMPTY_REPO_MAX_COMMITS = 2
const MERGED_PR_EXAMPLES = 5
const AUTO_COMMIT_MIN_COMMITS = 20
const AUTO_COMMIT_MIN_PERCENT = 50

// Counts the commits on a repo's main branch, 0 for a repo with no commits.
function countCommits(repo: GithubRepo): number {
  return repo.defaultBranchRef?.target.history.totalCount ?? 0
}

// Turns a part of a total into a whole percentage, 0 when the total is 0.
function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

// Sums values into buckets, e.g. contributions per month.
function addToBucket<K>(buckets: Map<K, number>, key: K, value: number) {
  buckets.set(key, (buckets.get(key) ?? 0) + value)
}

// Summarizes who the person says they are and who follows them.
export function buildProfile(overview: GithubOverview): Dossier['profile'] {
  return {
    login: overview.login,
    bio: overview.bio,
    accountAgeDays: Math.floor((Date.now() - Date.parse(overview.createdAt)) / DAY_MS),
    followers: overview.followers.totalCount,
    following: overview.following.totalCount,
    profileReadme:
      overview.profileReadme?.object?.text?.slice(0, PROFILE_README_MAX_CHARS) ?? null,
  }
}

// Counts own repos, forks, empty repos and stars, and lists every own repo.
export function buildRepos(overview: GithubOverview): Dossier['repos'] {
  const repos = overview.ownRepos.nodes

  return {
    own: overview.ownRepos.totalCount,
    forks: overview.forks.totalCount,
    empty: repos.filter((repo) => countCommits(repo) <= EMPTY_REPO_MAX_COMMITS).length,
    totalStars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    list: repos.map((repo) => ({
      name: repo.name,
      description: repo.description,
      language: repo.primaryLanguage?.name ?? null,
      stars: repo.stargazerCount,
      commits: countCommits(repo),
    })),
  }
}

// Measures how steady the last year of activity is, bursts versus regular work.
export function buildActivity(overview: GithubOverview): Dossier['activity'] {
  const calendar = overview.contributionsCollection.contributionCalendar
  const contributionsPerMonth = new Map<string, number>()
  const reposCreatedPerWeek = new Map<number, number>()

  for (const day of calendar.weeks.flatMap((week) => week.contributionDays)) {
    addToBucket(contributionsPerMonth, day.date.slice(0, 7), day.contributionCount)
  }
  for (const repo of overview.ownRepos.nodes) {
    addToBucket(reposCreatedPerWeek, Math.floor(Date.parse(repo.createdAt) / WEEK_MS), 1)
  }

  return {
    contributionsLastYear: calendar.totalContributions,
    activeWeeksLastYear: calendar.weeks.filter((week) =>
      week.contributionDays.some((day) => day.contributionCount > 0),
    ).length,
    busiestMonthPercent: percent(
      Math.max(0, ...contributionsPerMonth.values()),
      calendar.totalContributions,
    ),
    maxReposCreatedSameWeek: Math.max(0, ...reposCreatedPerWeek.values()),
  }
}

// Flags the repo holding most of the year's commits if its messages repeat.
export function detectAutoCommits(
  overview: GithubOverview,
  details: GithubDetails,
): Dossier['suspectedAutoCommits'] {
  const contributions = overview.contributionsCollection
  const topRepo = contributions.commitContributionsByRepository[0]

  if (!topRepo) {
    return null
  }

  const topRepoDetails = details.repos.find(
    (repo) => repo?.nameWithOwner === topRepo.repository.nameWithOwner,
  )
  const messages =
    topRepoDetails?.defaultBranchRef?.target.history.nodes.map((commit) =>
      commit.messageHeadline.trim().toLowerCase(),
    ) ?? []

  if (messages.length < AUTO_COMMIT_MIN_COMMITS) {
    return null
  }

  const countPerMessage = new Map<string, number>()
  for (const message of messages) {
    addToBucket(countPerMessage, message, 1)
  }

  const percentOfYearCommits = percent(
    topRepo.contributions.totalCount,
    contributions.totalCommitContributions,
  )
  const identicalMessagePercent = percent(
    Math.max(...countPerMessage.values()),
    messages.length,
  )

  if (
    percentOfYearCommits < AUTO_COMMIT_MIN_PERCENT ||
    identicalMessagePercent < AUTO_COMMIT_MIN_PERCENT
  ) {
    return null
  }
  return {
    repo: topRepo.repository.nameWithOwner,
    percentOfYearCommits,
    identicalMessagePercent,
  }
}

// Counts PRs merged into other people's repos and keeps the most notable ones.
export function buildMergedPRs(details: GithubDetails): Dossier['mergedPRsElsewhere'] {
  const examples = details.mergedPRs.nodes
    .map((pr) => ({
      repo: pr.repository.nameWithOwner,
      repoStars: pr.repository.stargazerCount,
      title: pr.title,
    }))
    .sort((a, b) => b.repoStars - a.repoStars)
    .slice(0, MERGED_PR_EXAMPLES)

  return { count: details.mergedPRs.issueCount, examples }
}

// Puts one showcase repo's README next to the numbers that back it up or not.
function buildShowcaseRepo(
  repo: GithubRepo,
  pinnedIds: string[],
  login: string,
  details: GithubDetails,
): Dossier['showcase'][number] {
  const repoDetails = details.repos.find(
    (candidate) => candidate?.nameWithOwner === repo.nameWithOwner,
  )
  const issueAuthors = repoDetails?.issues.nodes.map((issue) => issue.author?.login) ?? []

  return {
    name: repo.nameWithOwner,
    pinned: pinnedIds.includes(repo.id),
    isFork: repo.isFork,
    language: repo.primaryLanguage?.name ?? null,
    stars: repo.stargazerCount,
    forks: repo.forkCount,
    issuesByOthers: issueAuthors.filter((author) => author !== login).length,
    commits: countCommits(repo),
    createdAt: repo.createdAt.slice(0, 10),
    lastPushAt: repo.pushedAt?.slice(0, 10) ?? null,
    readmeExcerpt: repoDetails?.readme?.text?.slice(0, SHOWCASE_README_MAX_CHARS) ?? null,
  }
}

// Builds the showcase block from the repos picked for a closer look.
export function buildShowcase(
  overview: GithubOverview,
  showcase: GithubRepo[],
  details: GithubDetails,
): Dossier['showcase'] {
  const pinnedIds = overview.pinnedRepos.nodes.map((repo) => repo.id)

  return showcase.map((repo) =>
    buildShowcaseRepo(repo, pinnedIds, overview.login, details),
  )
}
