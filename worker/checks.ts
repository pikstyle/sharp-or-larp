export const CHECK_MAX_AGE_MS = 24 * 60 * 60 * 1000

type NewCheck = {
  githubLogin: string | null
  larpPercent: number
  avatarUrl: string | null
}

// Saves a check so the leaderboard can use it, and returns its id.
export async function saveCheck(db: D1Database, check: NewCheck): Promise<string | null> {
  const id = crypto.randomUUID()

  try {
    await db
      .prepare(
        `INSERT INTO checks (id, github_login, larp_percent, avatar_url, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, check.githubLogin, check.larpPercent, check.avatarUrl, Date.now())
      .run()
    return id
  } catch (error) {
    console.error('Could not save the check', error)
    return null
  }
}
