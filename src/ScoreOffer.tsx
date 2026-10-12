import type { ReactNode } from 'react'
import { larpZone } from './zones.ts'

type OfferProps = {
  larpPercent: number
  canRank: boolean
  onShare: () => void
  children?: ReactNode
}

// Under the verdict: put the score on the leaderboard, or share it as a card.
export default function ScoreOffer({ larpPercent, canRank, onShare, children }: OfferProps) {
  const zone = larpZone(larpPercent)
  const score = <strong style={{ color: zone.color }}>{larpPercent}% larp</strong>

  return (
    <section className="offer">
      <p className="kicker">Is this you?</p>
      <h2>{larpPercent < 40 ? 'Sharp. Show it off.' : 'Own the larp.'}</h2>
      {canRank ? (
        <p>Put this {score} on the leaderboard, or share it as a card.</p>
      ) : (
        <p>Share your {score}: a card with the score, the meter and the roast.</p>
      )}
      <div className="offer-actions">
        {children}
        <button type="button" onClick={onShare}>
          Share
        </button>
      </div>
    </section>
  )
}
