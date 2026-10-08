import { useState, type SubmitEvent } from 'react'
import type { Ad, AdsResponse } from '../worker/types.ts'
import { startAdCheckout } from './api.ts'

const MIN_TICKER_ITEMS = 6

type CardProps = {
  ad: Ad | undefined
  settings: AdsResponse
  freeSlots: number
  onBuy: () => void
}

// One classified ad in the side columns, or an empty spot to place one.
export function AdCard({ ad, settings, freeSlots, onBuy }: CardProps) {
  if (ad) {
    return (
      <a
        className="classified"
        href={ad.linkedinUrl}
        target="_blank"
        rel="noopener noreferrer nofollow sponsored"
      >
        <span className="classified-kicker">Open to work</span>
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

// A news ticker of classifieds that scrolls by, at the top or bottom on phones.
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
          <span className="ticker-tag">Open to work</span>
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
    <div className={`ticker ticker-${position}`} aria-label="Classifieds">
      <div className="ticker-track">
        {renderItems(0)}
        <div className="ticker-copy" aria-hidden="true">
          {renderItems(1)}
        </div>
      </div>
    </div>
  )
}

type FormProps = {
  settings: AdsResponse
  onClose: () => void
}

// The form to place a classified: it sends the visitor to Stripe to pay.
export function AdForm({ settings, onClose }: FormProps) {
  const [ad, setAd] = useState<Ad>({ name: '', headline: '', linkedinUrl: '' })
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Creates the Stripe payment page and moves the visitor there.
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setError(null)

    try {
      const { url } = await startAdCheckout(ad)
      window.location.assign(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setSending(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="ad-form-title">
      <form className="ad-form" onSubmit={handleSubmit}>
        <p className="kicker">Classifieds</p>
        <h2 id="ad-form-title">Place your ad</h2>
        <p className="ad-form-intro">
          ${settings.priceUsd} for {settings.days} days. Your name and LinkedIn sit next to every
          check, in front of students and recruiters.
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
