const CHECK_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type SavedCheck = {
  githubLogin: string | null
  larpPercent: number
}

// Saves a check's score so an ad can show it later, and returns its id.
export async function saveCheck(db: D1Database, check: SavedCheck): Promise<string | null> {
  const id = crypto.randomUUID()

  try {
    await db
      .prepare('INSERT INTO checks (id, github_login, larp_percent, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, check.githubLogin, check.larpPercent, Date.now())
      .run()
    return id
  } catch (error) {
    console.error('Could not save the check', error)
    return null
  }
}

// Finds a check from the last 24 hours: only those scores can go on an ad.
export async function findRecentCheck(db: D1Database, id: string): Promise<SavedCheck | null> {
  return db
    .prepare(
      `SELECT github_login AS githubLogin, larp_percent AS larpPercent FROM checks
       WHERE id = ? AND created_at > ?`,
    )
    .bind(id, Date.now() - CHECK_MAX_AGE_MS)
    .first<SavedCheck>()
}
