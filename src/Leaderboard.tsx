import { useState } from 'react'
import type {
  Board,
  LeaderboardAddResponse,
  LeaderboardEntry,
} from '../worker/types.ts'
import { addToLeaderboard } from './api.ts'
import { larpZone } from './zones.ts'

const FIRST_ROWS = 10

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

// Numbers the lines; equal scores share a place, like 1, 2, 2, 4.
function rankEntries(entries: LeaderboardEntry[]): number[] {
  return entries.map(
    (entry) => entries.findIndex((other) => other.larpPercent === entry.larpPercent) + 1,
  )
}

// Writes a date short, like "Oct 11", with the year only if it isn't this one.
function shortDate(time: number): string {
  const date = new Date(time)
  const thisYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: thisYear ? undefined : '2-digit',
  })
}

type RowProps = {
  entry: LeaderboardEntry
  rank: number
  highlighted: boolean
}

// One line of the board: place, avatar, login, date of the check, score.
function BoardRow({ entry, rank, highlighted }: RowProps) {
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
        {shortDate(entry.updatedAt)}
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
  sort: Board
  highlightLogin: string | null
  onSort: (sort: Board) => void
  onMore: () => void
}

// The leaderboard under the meter; a click on "Larp" flips who comes first.
export default function Leaderboard({
  entries,
  hasMore,
  loadingMore,
  error,
  sort,
  highlightLogin,
  onSort,
  onMore,
}: BoardProps) {
  const [expanded, setExpanded] = useState(false)

  const rows = entries ?? []
  const ranks = rankEntries(rows)
  const highlightIndex = rows.findIndex(
    (entry) => entry.login.toLowerCase() === highlightLogin?.toLowerCase(),
  )
  const showAll = expanded || highlightIndex >= FIRST_ROWS
  const visible = showAll ? rows : rows.slice(0, FIRST_ROWS)

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
            <span className="board-date">Date</span>
            <button
              type="button"
              className="board-score board-sort"
              onClick={() => onSort(sort === 'sharpest' ? 'larpiest' : 'sharpest')}
              aria-label={`Larp: ${sort} first. Click to flip.`}
            >
              Larp {sort === 'sharpest' ? '↑' : '↓'}
            </button>
          </div>
          <ol className="board-list">
            {visible.map((entry, index) => (
              <BoardRow
                key={entry.login}
                entry={entry}
                rank={ranks[index]}
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
