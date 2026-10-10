// How many analyses the whole site may run per day (UTC). Each one costs an LLM call, so this is
// the cap on the bill: tune it to your budget. The per-minute limiter in wrangler.jsonc is only a
// burst brake, counted per Cloudflare location; this one is counted once, in D1, for every location.
const DAILY_ANALYSES_MAX = 2000

// Counts one more analysis for today and tells whether it still fits the daily budget.
// One UPSERT does the count and the check at once, so parallel requests can't slip past the cap.
export async function takeDailyAnalysis(db: D1Database): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)

  try {
    const row = await db
      .prepare(
        `INSERT INTO analysis_budget (day, used) VALUES (?, 1)
         ON CONFLICT (day) DO UPDATE SET used = used + 1 WHERE used < ?
         RETURNING used`,
      )
      .bind(day, DAILY_ANALYSES_MAX)
      .first<{ used: number }>()
    return row !== null
  } catch (error) {
    // The database is down: let the analysis through rather than take the site down with it.
    console.error('Could not count the analysis against the daily budget', error)
    return true
  }
}
