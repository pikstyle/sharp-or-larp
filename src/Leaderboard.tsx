import { useState } from 'react'
import type {
  Board,
  LeaderboardAddResponse,
  LeaderboardEntry,
} from '../worker/types.ts'
import { addToLeaderboard } from './api.ts'
import { larpZone } from './zones.ts'

const FIRST_ROWS = 10
const DATE_SORTS: Board[] = ['newest', 'oldest']
const SORT_ARROWS: Record<Board, string> = {
  sharpest: '↑',
  larpiest: '↓',
  newest: '↓',
  oldest: '↑',
}

type AddProps = {
  checkId: string
  onAdded: (added: LeaderboardAddResponse) => void
}

// Puts the checked profile on the leaderboard, then points to its place there.
export function AddToLeaderboard({ checkId, onAdded }: AddProps) {
  const [added, setAdded] = useState<LeaderboardAddResponse | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sends the check to the board and keeps the place it landed on.
  async function handleClick() {
    setAdding(true)
    setError(null)
    try {
      const result = await addToLeaderboard(checkId)
      setAdded(result)
      onAdded(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setAdding(false)
    }
  }

  if (added) {
    return (
      <a className="button-link" href="#leaderboard">
        #{added.rank} {added.board} ↓
      </a>
    )
  }
  return (
    <>
      <button type="button" onClick={handleClick} disabled={adding}>
        {adding ? 'Adding…' : 'Add to leaderboard'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

// Says when a profile was last checked: "now", "5m ago", "3h ago", "Oct 8"…
function checkedWhen(time: number, now: number): string {
  const age = now - time
  if (age < MINUTE_MS) {
    return 'now'
  }
  if (age < HOUR_MS) {
    return `${Math.floor(age / MINUTE_MS)}m ago`
  }
  if (age < DAY_MS) {
    return `${Math.floor(age / HOUR_MS)}h ago`
  }
  if (age < WEEK_MS) {
    return `${Math.floor(age / DAY_MS)}d ago`
  }
  const date = new Date(time)
  const thisYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: thisYear ? undefined : '2-digit',
  })
}

type RowProps = {
  entry: LeaderboardEntry
  rank: number
  now: number
  highlighted: boolean
}

// One line of the board: place, avatar, login, date of the check, score.
function BoardRow({ entry, rank, now, highlighted }: RowProps) {
  return (
    <li className={highlighted ? 'board-row highlighted' : 'board-row'}>
      <span className="board-rank">{rank}</span>
      <a
        className="board-who"
        href={`https://github.com/${entry.login}`}
        target="_blank"
        rel="noreferrer"
      >
        {entry.avatarUrl ? (
          <img src={entry.avatarUrl} alt="" width={36} height={36} loading="lazy" />
        ) : (
          <span className="board-avatar" aria-hidden="true" />
        )}
        <strong className="board-name">@{entry.login}</strong>
      </a>
      <time className="board-date" dateTime={new Date(entry.updatedAt).toISOString()}>
        {checkedWhen(entry.updatedAt, now)}
      </time>
      <span className="board-score" style={{ color: larpZone(entry.larpPercent).color }}>
        {entry.larpPercent}%
      </span>
    </li>
  )
}

type BoardProps = {
  entries: LeaderboardEntry[] | null
  hasMore: boolean
  loadingMore: boolean
  error: string | null
  loadedAt: number
  sort: Board
  highlightLogin: string | null
  onSort: (sort: Board) => void
  onMore: () => void
}

// The leaderboard under the meter, sorted by larp or by date with a click.
export default function Leaderboard({
  entries,
  hasMore,
  loadingMore,
  error,
  loadedAt,
  sort,
  highlightLogin,
  onSort,
  onMore,
}: BoardProps) {
  const [expanded, setExpanded] = useState(false)

  const rows = entries ?? []
  const highlightIndex = rows.findIndex(
    (entry) => entry.login.toLowerCase() === highlightLogin?.toLowerCase(),
  )
  const showAll = expanded || highlightIndex >= FIRST_ROWS
  const visible = showAll ? rows : rows.slice(0, FIRST_ROWS)
  const byDate = DATE_SORTS.includes(sort)

  // Shows the rest of the loaded rows first, then loads the next 50.
  function showMore() {
    if (showAll) {
      onMore()
    } else {
      setExpanded(true)
    }
  }

  return (
    <section className="board" id="leaderboard" aria-labelledby="board-title">
      <h2 id="board-title">Leaderboard</h2>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!entries && !error && <p className="board-empty">Loading…</p>}
      {entries && rows.length === 0 && !error && (
        <p className="board-empty">Nobody ranked yet. Check a profile and add it.</p>
      )}

      {rows.length > 0 && (
        <>
          <div className="board-columns">
            <span>#</span>
            <span>Profile</span>
            <button
              type="button"
              className="board-date board-sort"
              onClick={() => onSort(sort === 'newest' ? 'oldest' : 'newest')}
              aria-label="Sort by date of the last check"
            >
              Date {byDate ? SORT_ARROWS[sort] : ''}
            </button>
            <button
              type="button"
              className="board-score board-sort"
              onClick={() => onSort(sort === 'sharpest' ? 'larpiest' : 'sharpest')}
              aria-label="Sort by larp score"
            >
              Larp {byDate ? '' : SORT_ARROWS[sort]}
            </button>
          </div>
          <ol className="board-list">
            {visible.map((entry, index) => (
              <BoardRow
                key={entry.login}
                entry={entry}
                rank={index + 1}
                now={loadedAt}
                highlighted={index === highlightIndex}
              />
            ))}
          </ol>
        </>
      )}

      {(rows.length > visible.length || hasMore) && (
        <button
          type="button"
          className="secondary board-more"
          onClick={showMore}
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading…' : 'Show more'}
        </button>
      )}
    </section>
  )
}
