import type {
  GithubCommit,
  GithubDetails,
  GithubOverview,
  GithubRepo,
  GithubRepoDetails,
} from './github.ts'
import type { GithubEvidence, ReadmeStyle } from './types.ts'
import { toWebUrl } from './web.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const PROFILE_README_MAX_CHARS = 2000
const SHOWCASE_README_MAX_CHARS = 1500
const REPO_DESCRIPTION_MAX_CHARS = 150
const EMPTY_REPO_MAX_COMMITS = 2
const MERGED_PR_EXAMPLES = 5
const AUTO_COMMIT_MIN_COMMITS = 20
const AUTO_COMMIT_MIN_PERCENT = 50
const BADGE = /img\.shields\.io|badgen\.net|forthebadge|badge\.fury|\/badge[s]?\b/gi
const WIDGET =
  /github-readme-stats|streak-stats|github-profile-trophy|readme-typing-svg|komarev|profile-counter|visitor-badge|activity-graph|skillicons\.dev|devicon|wakatime|github-readme-activity|metrics\.lecoq|leetcard|holopin|spotify-github/gi
const IMAGE = /!\[[^\]]*\]\(|<img\b/gi
const EMOJI = /\p{Extended_Pictographic}/gu
const TEMPLATE_PHRASE =
  /currently (working on|learning)|ask me about|fun fact|how to reach me|let'?s connect|connect with me|i'?m (a |an )?passionate|languages (and|&) tools|tech stack|my skills|pronouns:|get to know me/gi
const AI_COMMIT =
  /co-authored-by:[^\n]*(claude|copilot|cursor|codex|devin|aider|jules|gemini|chatgpt|openai|windsurf|lovable)|generated with \[?claude code|replit-commit-author:\s*agent|^aider: /im
const AI_BOT = /^(.*\[bot\]|cursor agent|copilot|devin ai|claude|lovable|v0)$/i
const AI_BOT_NAME = /lovable|gpt-engineer|bolt|v0|devin|copilot|cursor|jules|replit|codex|claude/i
const AI_BUILDERS: { name: string; pattern: RegExp }[] = [
  { name: 'Lovable', pattern: /lovable\.dev|lovable project|gpt-engineer|vite_react_shadcn_ts/i },
  { name: 'Bolt', pattern: /bolt\.new/i },
  { name: 'v0', pattern: /v0\.dev|v0\.app|\bv0\[bot\]/i },
  { name: 'Replit Agent', pattern: /replit-commit-author:\s*agent|replit agent/i },
]
const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b[\w-]+\.(?:dev|io|com|me|app|xyz|so|ai|co|fr|ca)\b[^\s<>"')]*/gi

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

// Counts the decorations of a profile README: badges, stats cards, emojis.
function measureReadmeStyle(readme: string): ReadmeStyle {
  const badges = readme.match(BADGE)?.length ?? 0
  const widgets = readme.match(WIDGET)?.length ?? 0
  const images = readme.match(IMAGE)?.length ?? 0

  return {
    badges,
    widgets,
    images: Math.max(0, images - badges - widgets),
    emojis: readme.match(EMOJI)?.length ?? 0,
    templatePhrases: readme.match(TEMPLATE_PHRASE)?.length ?? 0,
  }
}

// Tells whether their GitHub profile points to LinkedIn anywhere.
function linksToLinkedin(overview: GithubOverview, readme: string): boolean {
  const texts = [overview.bio, overview.websiteUrl, readme]
  const inTexts = texts.some((text) => text?.toLowerCase().includes('linkedin.com'))
  return inTexts || overview.socialAccounts.nodes.some((a) => a.provider === 'LINKEDIN')
}

// Summarizes who the person says they are and who follows them.
export function buildProfile(overview: GithubOverview): GithubEvidence['profile'] {
  const readme = overview.profileReadme?.object?.text ?? ''

  return {
    login: overview.login,
    bio: overview.bio || null,
    websiteUrl: overview.websiteUrl || null,
    linkedinOnProfile: linksToLinkedin(overview, readme),
    accountAgeDays: Math.floor((Date.now() - Date.parse(overview.createdAt)) / DAY_MS),
    followers: overview.followers.totalCount,
    following: overview.following.totalCount,
    profileReadme: readme ? readme.slice(0, PROFILE_README_MAX_CHARS) : null,
    readmeStyle: measureReadmeStyle(readme),
  }
}

// Finds their own website: the profile's website field, or a link in the bio.
export function findWebsite(overview: GithubOverview): string | null {
  const candidates = [overview.websiteUrl, ...(overview.bio?.match(URL_IN_TEXT) ?? [])]

  for (const candidate of candidates) {
    const url = candidate ? toWebUrl(candidate) : null
    const host = url?.hostname.replace(/^www\./, '') ?? ''
    if (url && !host.endsWith('linkedin.com') && host !== 'github.com') {
      return url.href
    }
  }
  return null
}

// Counts own repos, forks, empty repos and stars, and lists every own repo.
export function buildRepos(overview: GithubOverview): GithubEvidence['repos'] {
  const repos = overview.ownRepos.nodes

  return {
    own: overview.ownRepos.totalCount,
    forks: overview.forks.totalCount,
    empty: repos.filter((repo) => countCommits(repo) <= EMPTY_REPO_MAX_COMMITS).length,
    totalStars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    list: repos.map((repo) => ({
      name: repo.name,
      description: repo.description?.slice(0, REPO_DESCRIPTION_MAX_CHARS) ?? null,
      language: repo.primaryLanguage?.name ?? null,
      stars: repo.stargazerCount,
      commits: countCommits(repo),
    })),
  }
}

// Measures how steady the last year of activity is, bursts versus regular work.
export function buildActivity(overview: GithubOverview): GithubEvidence['activity'] {
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
): GithubEvidence['suspectedAutoCommits'] {
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
      commit.message.split('\n')[0].trim().toLowerCase(),
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
export function buildMergedPRs(details: GithubDetails): GithubEvidence['mergedPRsElsewhere'] {
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

// Tells whether a commit was written by an AI agent rather than by hand.
function isAiCommit(commit: GithubCommit): boolean {
  const author = commit.author?.user?.login ?? commit.author?.name ?? ''
  return AI_COMMIT.test(commit.message) || (AI_BOT.test(author) && AI_BOT_NAME.test(author))
}

// Measures how much of a repo was made by AI: share of AI commits, AI builder.
function measureAiUse(repo: GithubRepoDetails | null | undefined) {
  const commits = repo?.defaultBranchRef?.target.history.nodes ?? []
  const aiCommits = commits.filter(isAiCommit).length
  const traces = [repo?.readme?.text ?? '', ...commits.map((commit) => commit.message)].join('\n')
  const builder = AI_BUILDERS.find((candidate) => candidate.pattern.test(traces))

  return {
    aiCommitPercent: percent(aiCommits, commits.length),
    builtWith: builder?.name ?? null,
  }
}

// Puts one showcase repo's README next to the numbers that back it up or not.
function buildShowcaseRepo(
  repo: GithubRepo,
  pinnedIds: string[],
  cvRepoNames: string[],
  login: string,
  details: GithubDetails,
): GithubEvidence['showcase'][number] {
  const repoDetails = details.repos.find(
    (candidate) => candidate?.nameWithOwner === repo.nameWithOwner,
  )
  const issueAuthors = repoDetails?.issues.nodes.map((issue) => issue.author?.login) ?? []

  return {
    name: repo.nameWithOwner,
    description: repo.description?.slice(0, REPO_DESCRIPTION_MAX_CHARS) ?? null,
    pinned: pinnedIds.includes(repo.id),
    linkedFromCv: cvRepoNames.includes(repo.nameWithOwner.toLowerCase()),
    isFork: repo.isFork,
    language: repo.primaryLanguage?.name ?? null,
    stars: repo.stargazerCount,
    forks: repo.forkCount,
    issuesByOthers: issueAuthors.filter((author) => author !== login).length,
    commits: countCommits(repo),
    commitsByThem: repoDetails?.defaultBranchRef?.target.byThem.totalCount ?? 0,
    ...measureAiUse(repoDetails),
    createdAt: repo.createdAt.slice(0, 10),
    lastPushAt: repo.pushedAt?.slice(0, 10) ?? null,
    readmeExcerpt: repoDetails?.readme?.text?.slice(0, SHOWCASE_README_MAX_CHARS) ?? null,
  }
}

// Builds the showcase block from the repos picked for a closer look.
export function buildShowcase(
  overview: GithubOverview,
  showcase: GithubRepo[],
  cvRepoNames: string[],
  details: GithubDetails,
): GithubEvidence['showcase'] {
  const pinnedIds = overview.pinnedRepos.nodes.map((repo) => repo.id)

  return showcase.map((repo) =>
    buildShowcaseRepo(repo, pinnedIds, cvRepoNames, overview.login, details),
  )
}
