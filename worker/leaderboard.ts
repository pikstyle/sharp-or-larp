import type { Context } from 'hono'
import { CHECK_MAX_AGE_MS } from './checks.ts'
import {
  ApiError,
  type Board,
  type LeaderboardAddResponse,
  type LeaderboardEntry,
  type LeaderboardPage,
} from './types.ts'

type AppContext = Context<{ Bindings: Env }>

type RankedCheck = {
  githubLogin: string
  larpPercent: number
  avatarUrl: string | null
}

const PAGE_SIZE = 50
const MAX_PAGES = 100
const CACHED_PAGES = 10
const CACHE_SECONDS = 60
const SHARP_BELOW_PERCENT = 50
const SORT_ORDER: Record<Board, string> = {
  sharpest: 'larp_percent ASC, added_at ASC',
  larpiest: 'larp_percent DESC, added_at ASC',
}
const ENTRY_COLUMNS = `github_login AS login, avatar_url AS avatarUrl,
  larp_percent AS larpPercent, updated_at AS updatedAt`
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

// Reads which sort and which page of 50 the visitor asks for.
function readPageRequest(c: AppContext): { sort: Board; page: number } {
  const sort = c.req.query('sort') === 'larpiest' ? 'larpiest' : 'sharpest'
  const page = Number(c.req.query('page') ?? 0)

  if (!Number.isInteger(page) || page < 0 || page >= MAX_PAGES) {
    throw new ApiError(400, 'invalid_body')
  }
  return { sort, page }
}

// Names one page in the cache, the same for every visitor whatever they sent.
function pageCacheKey(origin: string, sort: Board, page: number): string {
  return `${origin}/api/leaderboard?sort=${sort}&page=${page}`
}

// Loads one page of the board from the database, and tells if more follow.
async function loadPage(db: D1Database, sort: Board, page: number): Promise<LeaderboardPage> {
  const { results } = await db
    .prepare(`SELECT ${ENTRY_COLUMNS} FROM leaderboard ORDER BY ${SORT_ORDER[sort]} LIMIT ? OFFSET ?`)
    .bind(PAGE_SIZE + 1, page * PAGE_SIZE)
    .all<LeaderboardEntry>()

  return { entries: results.slice(0, PAGE_SIZE), hasMore: results.length > PAGE_SIZE }
}

// Sends one page of the board, read at most once a minute from the database.
export async function listLeaderboard(c: AppContext) {
  const { sort, page } = readPageRequest(c)
  const key = pageCacheKey(new URL(c.req.url).origin, sort, page)
  const cached = await caches.default.match(key)
  const body = cached ? await cached.text() : JSON.stringify(await loadPage(c.env.DB, sort, page))

  if (!cached) {
    const copy = new Response(body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
    })
    c.executionCtx.waitUntil(caches.default.put(key, copy))
  }
  return c.body(body, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
}

// Forgets the cached pages, so the next visitor sees the board as it is now.
export async function forgetCachedBoard(origin: string) {
  const keys = (['sharpest', 'larpiest'] as const).flatMap((sort) =>
    Array.from({ length: CACHED_PAGES }, (_, page) => pageCacheKey(origin, sort, page)),
  )
  await Promise.all(keys.map((key) => caches.default.delete(key)))
}

// Reads the id of the check to put on the board.
async function readCheckId(c: AppContext): Promise<string> {
  const body = await c.req.json().catch(() => null)
  const checkId = body?.checkId

  if (typeof checkId !== 'string' || !UUID.test(checkId)) {
    throw new ApiError(400, 'check_expired')
  }
  return checkId
}

// Copies a recent GitHub check onto the board, or updates that profile's line.
async function saveEntry(db: D1Database, checkId: string) {
  const now = Date.now()

  return db
    .prepare(
      `INSERT INTO leaderboard (github_login, avatar_url, larp_percent, added_at, updated_at)
       SELECT github_login, avatar_url, larp_percent, ?, ? FROM checks
       WHERE id = ? AND created_at > ? AND github_login IS NOT NULL
       ON CONFLICT (github_login) DO UPDATE SET
         avatar_url = excluded.avatar_url,
         larp_percent = excluded.larp_percent,
         updated_at = excluded.updated_at
       RETURNING github_login AS login, larp_percent AS larpPercent`,
    )
    .bind(now, now, checkId, now - CHECK_MAX_AGE_MS)
    .first<{ login: string; larpPercent: number }>()
}

// Picks the sort that shows a profile best, and its place in it; ties share one.
async function findRank(db: D1Database, larpPercent: number) {
  const board: Board = larpPercent < SHARP_BELOW_PERCENT ? 'sharpest' : 'larpiest'
  const ahead = board === 'sharpest' ? '<' : '>'
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM leaderboard WHERE larp_percent ${ahead} ?`)
    .bind(larpPercent)
    .first<{ count: number }>()

  return { board, rank: (row?.count ?? 0) + 1 }
}

// Puts the profile of a recent check on the board and says where it landed.
export async function addToLeaderboard(c: AppContext) {
  const checkId = await readCheckId(c)
  const entry = await saveEntry(c.env.DB, checkId)

  if (!entry) {
    throw new ApiError(400, 'check_expired')
  }
  await forgetCachedBoard(new URL(c.req.url).origin)
  const response: LeaderboardAddResponse = {
    login: entry.login,
    ...(await findRank(c.env.DB, entry.larpPercent)),
  }
  return c.json(response)
}

// Keeps a ranked profile's score current each time someone checks it again.
export async function refreshLeaderboard(c: AppContext, entry: RankedCheck) {
  try {
    const result = await c.env.DB.prepare(
      `UPDATE leaderboard SET larp_percent = ?, avatar_url = ?, updated_at = ?
       WHERE github_login = ?`,
    )
      .bind(entry.larpPercent, entry.avatarUrl, Date.now(), entry.githubLogin)
      .run()
    if (result.meta.changes > 0) {
      await forgetCachedBoard(new URL(c.req.url).origin)
    }
  } catch (error) {
    console.error('Could not refresh the leaderboard', error)
  }
}
