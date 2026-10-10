import { parseVibe } from './judge.ts'
import type { Vibe } from './score.ts'

const VIBE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// Finds the vibe the LLM gave the last time it read exactly these texts, if it did.
// Reading the same texts twice would otherwise roll the dice twice: the model picks one of five
// labels, and two neighbouring labels can be 20 points apart on the meter.
export async function findVibe(db: D1Database, fingerprint: string): Promise<Vibe | null> {
  try {
    const row = await db
      .prepare('SELECT vibe FROM vibes WHERE fingerprint = ? AND created_at > ?')
      .bind(fingerprint, Date.now() - VIBE_MAX_AGE_MS)
      .first<{ vibe: string }>()
    return row ? parseVibe(row.vibe) : null
  } catch (error) {
    // A missing table or a broken row only costs one more LLM call.
    console.error('Could not look up the saved vibe', error)
    return null
  }
}

// Keeps the LLM's vibe for these texts, and clears the ones nobody asked about for a month.
export async function saveVibe(db: D1Database, fingerprint: string, vibe: Vibe): Promise<void> {
  const now = Date.now()

  try {
    await db.batch([
      db.prepare('DELETE FROM vibes WHERE created_at < ?').bind(now - VIBE_MAX_AGE_MS),
      db
        .prepare('INSERT OR REPLACE INTO vibes (fingerprint, vibe, created_at) VALUES (?, ?, ?)')
        .bind(fingerprint, JSON.stringify(vibe), now),
    ])
  } catch (error) {
    console.error('Could not save the vibe', error)
  }
}
