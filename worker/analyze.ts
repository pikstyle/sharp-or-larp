import type { Context } from 'hono'
import {
  buildActivity,
  buildMergedPRs,
  buildProfile,
  buildRepos,
  buildShowcase,
  detectAutoCommits,
} from './dossier.ts'
import {
  fetchGithubDetails,
  fetchGithubOverview,
  parseGithubLogin,
  pickReposToInspect,
} from './github.ts'
import { ApiError, type AnalyzeResponse, type Dossier } from './types.ts'

type AppContext = Context<{ Bindings: Env }>

// Reads the request body and returns the GitHub link it contains.
async function readAnalyzeRequest(c: AppContext): Promise<string> {
  const body = await c.req.json().catch(() => null)

  if (typeof body?.github !== 'string') {
    throw new ApiError(400, 'invalid_body')
  }
  return body.github
}

// Runs the POST /api/analyze steps in order and answers with the result.
export async function analyze(c: AppContext) {
  const github = await readAnalyzeRequest(c)
  const login = parseGithubLogin(github)
  const overview = await fetchGithubOverview(login, c.env.GITHUB_TOKEN)
  const toInspect = pickReposToInspect(overview)
  const details = await fetchGithubDetails(
    overview.login,
    toInspect.ids,
    c.env.GITHUB_TOKEN,
  )

  const dossier: Dossier = {
    profile: buildProfile(overview),
    repos: buildRepos(overview),
    activity: buildActivity(overview),
    suspectedAutoCommits: detectAutoCommits(overview, details),
    mergedPRsElsewhere: buildMergedPRs(details),
    showcase: buildShowcase(overview, toInspect.showcase, details),
  }

  const response: AnalyzeResponse = {
    login: overview.login,
    avatarUrl: overview.avatarUrl,
    dossier,
  }
  return c.json(response)
}
