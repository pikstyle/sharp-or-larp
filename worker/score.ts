import type { Dossier, GithubEvidence, ReadmeStyle, Verdict } from './types.ts'

export type VibeLabel = 'sharp' | 'mostly_sharp' | 'mixed' | 'mostly_larp' | 'larp'

export type Vibe = {
  vibe: VibeLabel
  redFlags: string[]
  greenFlags: string[]
  roast: string
}

type Signal = { points: number; text: string | null }
type Flag = { text: string; weight: number }

export type FactsScore = {
  larpPercent: number
  fromGithub: boolean
  redFlags: Flag[]
  greenFlags: Flag[]
}

const GITHUB_BASE_SCORE = 58
const CV_ONLY_BASE_SCORE = 50
const MIN_COMMITS_TO_CLAIM = 10
const NOTABLE_REPO_STARS = 1000
const BUSY_CONTRIBUTIONS = 500
const MAX_FLAGS = 3
const VIBE_CODED_AI_PERCENT = 60
const USED_REPO_STARS = 30
const USED_REPO_ISSUES = 3
const README_MAX_POINTS = 12
const VERY_FLASHY_README = 6
const UNBACKED_FLASH_FACTOR = 1.5
const BACKING_PROJECT_STARS = 10
const BACKING_MERGED_PRS = 3
const LINKEDIN_POINTS = 2
const DEAD_WEBSITE_POINTS = 4
const SHARP_VIBES: VibeLabel[] = ['sharp', 'mostly_sharp']
const LARP_VIBES: VibeLabel[] = ['mostly_larp', 'larp']
const FACTS_WEIGHT = 1.6
const CV_ONLY_FACTS_WEIGHT = 1
const VIBE_LEANS: Record<VibeLabel, number> = {
  sharp: -2.5,
  mostly_sharp: -1,
  mixed: 0,
  mostly_larp: 1.5,
  larp: 3,
}

// Formats a number for a flag, e.g. 12450 becomes "12,450".
function format(value: number): string {
  return value.toLocaleString('en-US')
}

// Writes a count with its word, e.g. "1 badge" or "12 badges".
function plural(count: number, word: string): string {
  return `${format(count)} ${word}${count === 1 ? '' : 's'}`
}

// Finds the most starred project they really worked on, their own or pinned.
function bestProject(github: GithubEvidence): { name: string; stars: number } | null {
  const login = github.profile.login
  const ownRepos = github.repos.list.map((repo) => ({
    name: `${login}/${repo.name}`,
    stars: repo.stars,
  }))
  const workedOn = github.showcase
    .filter((repo) => !repo.isFork && repo.commitsByThem >= MIN_COMMITS_TO_CLAIM)
    .map((repo) => ({ name: repo.name, stars: repo.stars }))

  return [...ownRepos, ...workedOn].sort((a, b) => b.stars - a.stars)[0] ?? null
}

// Scores a flashy profile README: a lot more when little real work stands behind it.
function readmeSignal(style: ReadmeStyle, backedByWork: boolean): Signal | null {
  const decoration =
    Math.min(4, style.widgets * 1.5) +
    Math.min(2, style.images * 0.35) +
    Math.min(2, style.emojis * 0.15) +
    Math.min(3, style.templatePhrases)
  const flashiness = Math.min(4, style.badges * 0.4) + decoration
  const fullFlashiness = Math.min(8, style.badges * 0.4) + decoration
  const storefrontOnly = backedByWork
    ? 0
    : Math.max(0, fullFlashiness - VERY_FLASHY_README) * UNBACKED_FLASH_FACTOR
  const points = Math.min(README_MAX_POINTS, flashiness) + storefrontOnly
  const parts = [
    style.badges > 0 && plural(style.badges, 'badge'),
    style.widgets > 0 && plural(style.widgets, 'stats widget'),
    style.emojis >= 5 && plural(style.emojis, 'emoji'),
    style.templatePhrases > 0 && 'template sections ("Currently learning", "Let\'s connect"…)',
  ].filter(Boolean)

  const label = storefrontOnly > 0 ? 'Flashy profile README, little work behind it' : 'Flashy profile README'
  return points >= 3 ? { points, text: `${label}: ${parts.join(', ')}` } : null
}

// Spots showcase repos written by AI tools that nobody uses: AI slop, not products.
function vibeCodingSignal(github: GithubEvidence): Signal | null {
  const vibeCoded = github.showcase.filter(
    (repo) =>
      (repo.builtWith || repo.aiCommitPercent >= VIBE_CODED_AI_PERCENT) &&
      repo.stars < USED_REPO_STARS &&
      repo.issuesByOthers < USED_REPO_ISSUES,
  )
  const [first] = vibeCoded
  if (!first) {
    return null
  }

  const allOfThem = vibeCoded.length === github.showcase.length && vibeCoded.length >= 2
  const reason = first.builtWith
    ? `${first.name} was built with ${first.builtWith}`
    : `${first.aiCommitPercent}% of recent commits in ${first.name} were written by an AI agent`
  const more = vibeCoded.length > 1 ? ` (+${vibeCoded.length - 1} more vibe-coded)` : ''

  return {
    points: Math.min(18, 7 * vibeCoded.length) + (allOfThem ? 6 : 0),
    text: `Vibe-coded: ${reason}${more}`,
  }
}

// Lists what their GitHub numbers say, as larp points (+) or sharp points (-).
function githubSignals(github: GithubEvidence): Signal[] {
  const { profile, repos, activity, mergedPRsElsewhere: prs } = github
  const signals: Signal[] = []
  const busy = activity.contributionsLastYear >= BUSY_CONTRIBUTIONS
  const best = bestProject(github)
  const notablePr = prs.examples.find((pr) => pr.repoStars >= NOTABLE_REPO_STARS)
  const followerPoints = Math.min(14, 4 * Math.log10(1 + profile.followers))
  const backedByWork =
    busy || (best?.stars ?? 0) >= BACKING_PROJECT_STARS || prs.count >= BACKING_MERGED_PRS
  const readme = readmeSignal(profile.readmeStyle, backedByWork)
  const vibeCoding = vibeCodingSignal(github)

  if (best && best.stars > 0) {
    const points = -Math.min(28, 7 * Math.log10(1 + best.stars))
    const text = best.stars >= 10 ? `Works on ${best.name} (${format(best.stars)} ★)` : null
    signals.push({ points, text })
  }
  if (profile.followers >= 20 && profile.followers >= profile.following) {
    const points = profile.followers >= 2 * profile.following ? -followerPoints : -followerPoints / 2
    const text =
      profile.followers >= 50
        ? `${format(profile.followers)} followers, follows ${format(profile.following)}`
        : null
    signals.push({ points, text })
  }
  if (profile.following >= 200 && profile.followers < profile.following) {
    const text = `Follows ${format(profile.following)} people, followed by ${format(profile.followers)}`
    signals.push({ points: 12, text })
  }
  if (activity.contributionsLastYear > 0) {
    const points = -Math.min(14, 3.5 * Math.log10(1 + activity.contributionsLastYear))
    const text =
      activity.contributionsLastYear >= 300
        ? `${format(activity.contributionsLastYear)} contributions in the last year`
        : null
    signals.push({ points, text })
  }
  if (activity.activeWeeksLastYear > 0) {
    const points = -(activity.activeWeeksLastYear / 53) * 8
    const text =
      activity.activeWeeksLastYear >= 30
        ? `Active ${activity.activeWeeksLastYear} weeks out of 52`
        : null
    signals.push({ points, text })
  }
  if (prs.count > 0) {
    const points = -Math.min(16, 5 * Math.log10(1 + prs.count))
    const text = prs.count >= 3 ? `${format(prs.count)} PRs merged into other people's projects` : null
    signals.push({ points, text })
  }
  if (notablePr) {
    const text = `Code merged into ${notablePr.repo} (${format(notablePr.repoStars)} ★)`
    signals.push({ points: -4, text })
  }
  if (readme) {
    signals.push(readme)
  }
  if (vibeCoding) {
    signals.push(vibeCoding)
  }
  if (github.website?.status === 'dead') {
    const text = `The website on their GitHub doesn't load (${github.website.note})`
    signals.push({ points: DEAD_WEBSITE_POINTS, text })
  }
  if (profile.linkedinOnProfile) {
    signals.push({ points: LINKEDIN_POINTS, text: 'LinkedIn linked from their GitHub profile' })
  }
  if (!busy && repos.own >= 5 && repos.empty / repos.own > 0.5) {
    signals.push({ points: 6, text: `${repos.empty} of their ${repos.own} repos are (nearly) empty` })
  }
  if (!busy && repos.forks > repos.own) {
    signals.push({ points: 4, text: `More forks (${repos.forks}) than own repos (${repos.own})` })
  }
  if (github.suspectedAutoCommits) {
    const { repo, percentOfYearCommits } = github.suspectedAutoCommits
    const text = `${repo} holds ${percentOfYearCommits}% of the year's commits, mostly the same message`
    signals.push({ points: 15, text })
  }
  if (!busy && activity.maxReposCreatedSameWeek >= 10) {
    const text = `${activity.maxReposCreatedSameWeek} repos created in a single week`
    signals.push({ points: 6, text })
  }
  if (repos.own >= 3 && (best?.stars ?? 0) === 0) {
    signals.push({ points: 5, text: `Not a single star across their ${repos.own} repos` })
  }
  if (activity.contributionsLastYear < 50) {
    const text = `Only ${activity.contributionsLastYear} contributions in the last year`
    signals.push({ points: 5, text })
  }
  return signals
}

// Lists what the CV's links say: dead links count against, working ones for.
function cvSignals(cv: Dossier['cv']): Signal[] {
  const links = cv?.links ?? []
  const dead = links.filter((link) => link.status === 'dead')
  const working = links.filter((link) => link.status === 'ok')
  const signals: Signal[] = dead.slice(0, 2).map((link) => ({
    points: 6,
    text: `Dead link in their CV: ${new URL(link.url).hostname}`,
  }))

  if (working.length > 0) {
    const text = working.length >= 2 ? `${working.length} links in their CV lead to real pages` : null
    signals.push({ points: -Math.min(6, working.length * 2), text })
  }
  return signals
}

// Scores what the facts say, from 0 (sharp) to 100 (larp), with the reasons.
export function scoreFacts(dossier: Dossier): FactsScore {
  const signals = [
    ...(dossier.github ? githubSignals(dossier.github) : []),
    ...cvSignals(dossier.cv),
  ]
  const base = dossier.github ? GITHUB_BASE_SCORE : CV_ONLY_BASE_SCORE
  const total = signals.reduce((sum, signal) => sum + signal.points, base)

  return {
    larpPercent: Math.min(100, Math.max(0, total)),
    fromGithub: dossier.github !== null,
    redFlags: signals.flatMap(({ points, text }) =>
      points > 0 && text ? [{ text, weight: points }] : [],
    ),
    greenFlags: signals.flatMap(({ points, text }) =>
      points < 0 && text ? [{ text, weight: -points }] : [],
    ),
  }
}

// Keeps the strongest fact-based flags and fills up with the LLM's ones.
function pickFlags(factFlags: Flag[], vibeFlags: string[]): string[] {
  const strongest = [...factFlags]
    .sort((a, b) => b.weight - a.weight)
    .map((flag) => flag.text)
  const fromFacts = strongest.slice(0, vibeFlags.length > 0 ? MAX_FLAGS - 1 : MAX_FLAGS)

  return [...fromFacts, ...vibeFlags].slice(0, MAX_FLAGS)
}

// Turns a 0-100 score into how hard it leans larp (above 0) or sharp (below 0).
function lean(percent: number): number {
  const share = Math.min(0.99, Math.max(0.01, percent / 100))
  return Math.log(share / (1 - share))
}

// Adds up the facts and the LLM's gut feeling: when they agree, the score goes extreme.
export function combineVerdict(facts: FactsScore, vibe: Vibe): Verdict {
  const factsWeight = facts.fromGithub ? FACTS_WEIGHT : CV_ONLY_FACTS_WEIGHT
  const total = factsWeight * lean(facts.larpPercent) + VIBE_LEANS[vibe.vibe]
  const blended = 100 / (1 + Math.exp(-total))
  const vibeRedFlags = SHARP_VIBES.includes(vibe.vibe) ? [] : vibe.redFlags
  const vibeGreenFlags = LARP_VIBES.includes(vibe.vibe) ? [] : vibe.greenFlags

  return {
    larpPercent: Math.round(blended),
    redFlags: pickFlags(facts.redFlags, vibeRedFlags),
    greenFlags: pickFlags(facts.greenFlags, vibeGreenFlags),
    roast: vibe.roast,
  }
}
