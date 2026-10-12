import { useEffect, useState } from 'react'
import type { Board, LeaderboardEntry } from '../worker/types.ts'
import { fetchLeaderboard } from './api.ts'

const PAGE_SIZE = 50
const MAX_PAGES_AT_ONCE = 10

type BoardState = {
  sort: Board
  entries: LeaderboardEntry[]
  hasMore: boolean
  error: string | null
  loadedAt: number
}

// Loads pages from the top until it holds at least that many rows, or all of them.
async function loadPages(sort: Board, minRows: number) {
  const entries: LeaderboardEntry[] = []
  let hasMore = true

  for (let page = 0; hasMore && page < MAX_PAGES_AT_ONCE; page++) {
    const loaded = await fetchLeaderboard(sort, page)
    entries.push(...loaded.entries)
    hasMore = loaded.hasMore
    if (entries.length >= minRows) {
      break
    }
  }
  return { entries, hasMore }
}

// Loads the board in this order, down to row minRows; version reloads it.
export function useLeaderboard(sort: Board, minRows: number, version: number) {
  const [state, setState] = useState<BoardState | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let current = true
    loadPages(sort, minRows)
      .then((loaded) => ({ ...loaded, error: null }))
      .catch((caught: Error) => ({ entries: [], hasMore: false, error: caught.message }))
      .then((loaded) => current && setState({ sort, ...loaded, loadedAt: Date.now() }))
    return () => {
      current = false
    }
  }, [sort, minRows, version])

  // Adds the next page of 50 under the rows already shown.
  async function loadMore() {
    if (!state || state.sort !== sort || loadingMore) {
      return
    }
    setLoadingMore(true)
    try {
      const loaded = await fetchLeaderboard(sort, Math.ceil(state.entries.length / PAGE_SIZE))
      setState({
        ...state,
        entries: [...state.entries, ...loaded.entries],
        hasMore: loaded.hasMore,
        loadedAt: Date.now(),
      })
    } catch (caught) {
      setState({ ...state, error: caught instanceof Error ? caught.message : String(caught) })
    } finally {
      setLoadingMore(false)
    }
  }

  return {
    entries: state?.entries ?? null,
    hasMore: state?.hasMore ?? false,
    error: state?.error ?? null,
    loadedAt: state?.loadedAt ?? 0,
    loadingMore,
    loadMore,
  }
}
