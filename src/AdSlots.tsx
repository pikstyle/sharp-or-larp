import { useState, type SubmitEvent } from 'react'
import type { Ad, AdsResponse, AdText } from '../worker/types.ts'
import { startAdCheckout } from './api.ts'
import { larpZone } from './zones.ts'

const MIN_TICKER_ITEMS = 6

export type AdScore = {
  checkId: string
  larpPercent: number
  githubLogin: string | null
}

type ScoreTagProps = {
  larpPercent: number | null
  githubLogin: string | null
  className: string
}

// Writes an ad's score, e.g. "12% larp · @login", in the color of its zone.
function ScoreTag({ larpPercent, githubLogin, className }: ScoreTagProps) {
  if (larpPercent === null) {
    return null
  }
  return (
    <span className={className} style={{ color: larpZone(larpPercent).ink }}>
      {larpPercent}% larp · {githubLogin ? `@${githubLogin}` : 'from a CV'}
    </span>
  )
}

type CardProps = {
  ad: Ad | undefined
  settings: AdsResponse
  freeSlots: number
  onBuy: () => void
}

// One ad in the side columns, or an empty spot to place one.
export function AdCard({ ad, settings, freeSlots, onBuy }: CardProps) {
  if (ad) {
    return (
      <a
        className="classified"
        href={ad.linkedinUrl}
        target="_blank"
        rel="noopener noreferrer nofollow sponsored"
      >
        <ScoreTag {...ad} className="classified-kicker" />
        <strong className="classified-name">{ad.name}</strong>
        <span className="classified-headline">{ad.headline}</span>
        <span className="classified-link">LinkedIn →</span>
      </a>
    )
  }

  return (
    <button type="button" className="classified classified-empty" onClick={onBuy}>
      <span className="classified-kicker">Your ad here</span>
      <strong className="classified-name">Looking for a job?</strong>
      <span className="classified-headline">
        {freeSlots} of {settings.slots} spots left · ${settings.priceUsd} for {settings.days}{' '}
        days
      </span>
      <span className="classified-link">Place an ad →</span>
    </button>
  )
}

type TickerProps = {
  ads: Ad[]
  settings: AdsResponse
  position: 'top' | 'bottom'
  onBuy: () => void
}

// A ticker of ads that scrolls by, at the top or bottom on phones.
export function AdStrip({ ads, settings, position, onBuy }: TickerProps) {
  const hasFreeSlot = ads.length < settings.slots
  const items: (Ad | null)[] = [...ads, ...(hasFreeSlot ? [null] : [])]
  if (items.length === 0) {
    return null
  }

  const filled = Array.from(
    { length: Math.max(MIN_TICKER_ITEMS, items.length) },
    (_, index) => items[index % items.length],
  )

  // Draws one copy of the items; a second copy makes the scrolling loop seamless.
  const renderItems = (copy: number) =>
    filled.map((ad, index) =>
      ad ? (
        <a
          key={`${copy}-${index}`}
          className="ticker-item"
          href={ad.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          tabIndex={copy === 0 ? 0 : -1}
        >
          <ScoreTag {...ad} className="ticker-tag" />
          <strong>{ad.name}</strong> — {ad.headline}
        </a>
      ) : (
        <button
          key={`${copy}-${index}`}
          type="button"
          className="ticker-item ticker-ad"
          onClick={onBuy}
          tabIndex={copy === 0 ? 0 : -1}
        >
          <span className="ticker-tag">Your ad here</span>${settings.priceUsd} for{' '}
          {settings.days} days
        </button>
      ),
    )

  return (
    <div className={`ticker ticker-${position}`} aria-label="Ads">
      <div className="ticker-track">
        {renderItems(0)}
        <div className="ticker-copy" aria-hidden="true">
          {renderItems(1)}
        </div>
      </div>
    </div>
  )
}

type OfferProps = {
  score: AdScore
  settings: AdsResponse
  freeSlots: number
  onBuy: () => void
}

// Invites the person just checked to put their score next to their LinkedIn.
export function AdOffer({ score, settings, freeSlots, onBuy }: OfferProps) {
  const zone = larpZone(score.larpPercent)

  return (
    <section className="ad-offer">
      <p className="kicker">Is this you?</p>
      <h2>{score.larpPercent < 40 ? 'Sharp. Show it off.' : 'Own the larp.'}</h2>
      <p>
        Put your <strong style={{ color: zone.ink }}>{score.larpPercent}% larp</strong> next to
        your LinkedIn, in front of everyone checking profiles here. ${settings.priceUsd} for{' '}
        {settings.days} days.
      </p>
      {freeSlots > 0 ? (
        <button type="button" onClick={onBuy}>
          Place my ad
        </button>
      ) : (
        <p className="muted">Every spot is taken right now. Come back in a few days.</p>
      )}
    </section>
  )
}

type FormProps = {
  score: AdScore
  settings: AdsResponse
  onClose: () => void
}

// The form to place an ad with a check's score: it sends the visitor to Stripe.
export function AdForm({ score, settings, onClose }: FormProps) {
  const [ad, setAd] = useState<AdText>({ name: '', headline: '', linkedinUrl: '' })
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const zone = larpZone(score.larpPercent)

  // Creates the Stripe payment page and moves the visitor there.
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setError(null)

    try {
      const { url } = await startAdCheckout({ ...ad, checkId: score.checkId })
      window.location.assign(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setSending(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="ad-form-title">
      <form className="ad-form" onSubmit={handleSubmit}>
        <h2 id="ad-form-title">Place your ad</h2>

        <div className="ad-form-score">
          <strong style={{ color: zone.ink }}>{score.larpPercent}% larp</strong>
          <span>
            {score.githubLogin ? `@${score.githubLogin}` : 'From your CV'} · comes from your
            check, can't be edited
          </span>
        </div>

        <p className="ad-form-intro">
          ${settings.priceUsd} for {settings.days} days. Your name, your score and your LinkedIn
          sit next to every check, in front of students and recruiters.
        </p>

        <label>
          Name
          <input
            value={ad.name}
            onChange={(event) => setAd({ ...ad, name: event.target.value })}
            maxLength={40}
            required
          />
        </label>
        <label>
          Headline
          <input
            value={ad.headline}
            onChange={(event) => setAd({ ...ad, headline: event.target.value })}
            placeholder="CS student, looking for a summer internship"
            maxLength={80}
            required
          />
        </label>
        <label>
          LinkedIn profile
          <input
            type="url"
            value={ad.linkedinUrl}
            onChange={(event) => setAd({ ...ad, linkedinUrl: event.target.value })}
            placeholder="https://www.linkedin.com/in/your-name"
            maxLength={200}
            required
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="ad-form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={sending}>
            {sending ? 'Opening Stripe…' : `Pay $${settings.priceUsd}`}
          </button>
        </div>
      </form>
    </div>
  )
}
