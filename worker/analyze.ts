import type { Context } from 'hono'
import { saveCheck } from './checks.ts'
import { buildCv, fetchCvLinks, findGithubLoginInCv, planCvLinks } from './cv.ts'
import { findCvProblem } from './cvCheck.ts'
import {
  buildActivity,
  buildMergedPRs,
  buildProfile,
  buildRepos,
  buildShowcase,
  detectAutoCommits,
  findWebsite,
} from './dossier.ts'
import {
  fetchCommitCounts,
  fetchGithubDetails,
  fetchGithubOverview,
  parseGithubLogin,
  pickReposToInspect,
  type GithubOverview,
} from './github.ts'
import { judgeVibe, parseVibe } from './judge.ts'
import { combineVerdict, scoreFacts } from './score.ts'
import {
  ApiError,
  type AnalyzeResponse,
  type CvInput,
  type Dossier,
  type GithubEvidence,
} from './types.ts'
import { visitWebsite } from './web.ts'

type AppContext = Context<{ Bindings: Env }>

const CV_MAX_LINKS = 30
const GITHUB_INPUT_MAX_CHARS = 200

// Checks the optional CV: text that reads like a CV, and a list of links.
function readCv(value: unknown): CvInput | null {
  if (value === undefined || value === null) {
    return null
  }

  const cv = value as { text?: unknown; links?: unknown }
  if (typeof cv.text !== 'string' || !Array.isArray(cv.links)) {
    throw new ApiError(400, 'invalid_body')
  }
  const problem = findCvProblem(cv.text)
  if (problem) {
    throw new ApiError(400, problem)
  }

  const links = cv.links.filter(
    (link): link is string => typeof link === 'string' && link.length <= 500,
  )
  return { text: cv.text, links: links.slice(0, CV_MAX_LINKS) }
}

// Reads the request body: a GitHub link, a CV, or both.
async function readAnalyzeRequest(c: AppContext) {
  const body = await c.req.json().catch(() => null)
  const github = body?.github ?? null

  if (github !== null && (typeof github !== 'string' || github.length > GITHUB_INPUT_MAX_CHARS)) {
    throw new ApiError(400, 'invalid_body')
  }

  const cv = readCv(body?.cv)
  if (!github?.trim() && !cv) {
    throw new ApiError(400, 'missing_input')
  }
  return { github: github?.trim() || null, cv }
}

// Loads the GitHub profile given, or the one the CV points to if it exists.
async function loadGithubProfile(
  github: string | null,
  cv: CvInput | null,
  token: string,
): Promise<GithubOverview | null> {
  if (github) {
    return fetchGithubOverview(parseGithubLogin(github), token)
  }

  const loginInCv = cv ? findGithubLoginInCv(cv.links) : null
  if (!loginInCv) {
    return null
  }
  return fetchGithubOverview(loginInCv, token).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === 'github_user_not_found') {
      return null
    }
    throw error
  })
}

// Collects the GitHub evidence: details of the key repos, and a visit of their site.
async function collectGithubEvidence(
  overview: GithubOverview,
  websiteUrl: string | null,
  cvRepoNames: string[],
  token: string,
): Promise<GithubEvidence> {
  const toInspect = pickReposToInspect(overview, cvRepoNames)
  const [details, commitCounts, website] = await Promise.all([
    fetchGithubDetails(overview, toInspect.ids, token),
    fetchCommitCounts(overview.ownRepos.nodes, token),
    websiteUrl ? visitWebsite(websiteUrl) : null,
  ])

  return {
    profile: buildProfile(overview),
    website,
    repos: buildRepos(overview, commitCounts),
    activity: buildActivity(overview),
    suspectedAutoCommits: detectAutoCommits(overview, details),
    mergedPRsElsewhere: buildMergedPRs(details),
    showcase: buildShowcase(overview, toInspect.showcase, cvRepoNames, details),
  }
}

// Runs the POST /api/analyze steps in order and answers with the verdict.
export async function analyze(c: AppContext) {
  const request = await readAnalyzeRequest(c)
  const overview = await loadGithubProfile(request.github, request.cv, c.env.GITHUB_TOKEN)
  const websiteUrl = overview ? findWebsite(overview) : null
  const cvPlan = request.cv
    ? planCvLinks(request.cv.links, overview?.login ?? null, websiteUrl)
    : null
  const cvRepoNames = cvPlan?.repoNames ?? []

  const [github, cvLinks] = await Promise.all([
    overview
      ? collectGithubEvidence(overview, websiteUrl, cvRepoNames, c.env.GITHUB_TOKEN)
      : null,
    fetchCvLinks(cvPlan),
  ])
  const dossier: Dossier = { github, cv: buildCv(request.cv, cvPlan, cvLinks) }

  const facts = scoreFacts(dossier)
  const vibe = parseVibe(await judgeVibe(dossier, c.env))
  const verdict = combineVerdict(facts, vibe)
  console.log('verdict', overview?.login ?? 'cv-only', {
    facts: Math.round(facts.larpPercent),
    vibe: vibe.vibe,
    final: verdict.larpPercent,
  })

  const login = overview?.login ?? null
  const response: AnalyzeResponse = {
    checkId: await saveCheck(c.env.DB, { githubLogin: login, larpPercent: verdict.larpPercent }),
    login,
    avatarUrl: overview?.avatarUrl ?? null,
    verdict,
  }
  return c.json(response)
}
