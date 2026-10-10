import { useEffect, useState, type SubmitEvent } from 'react'
import type { Ad, AdsResponse, AdText } from '../worker/types.ts'
import { toAdImage } from './adImage.ts'
import { startAdCheckout } from './api.ts'
import { useTurnstile } from './useTurnstile.ts'
import { larpZone } from './zones.ts'

const MIN_TICKER_ITEMS = 6
const SPONSORED = 'noopener noreferrer nofollow sponsored'

export type AdScore = {
  checkId: string
  larpPercent: number
  githubLogin: string | null
}

// Names where an ad leads: LinkedIn, GitHub, or the site's own address.
function linkLabel(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '')
  if (host.endsWith('linkedin.com')) {
    return 'LinkedIn'
  }
  return host === 'github.com' ? 'GitHub' : host
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
    <span className={className} style={{ color: larpZone(larpPercent).color }}>
      {larpPercent}% larp · {githubLogin ? `@${githubLogin}` : 'from a CV'}
    </span>
  )
}

type CardProps = {
  ad: Ad
}

// One running ad in a side column: who, what they do, their score, their link.
export function AdCard({ ad }: CardProps) {
  return (
    <a className="ad-card" href={ad.url} target="_blank" rel={SPONSORED}>
      <span className="ad-card-head">
        {ad.imageUrl ? (
          <img src={ad.imageUrl} alt="" width={36} height={36} />
        ) : (
          <span className="ad-card-initial" aria-hidden="true">
            {ad.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="ad-card-who">
          <strong>{ad.name}</strong>
          <span className="ad-card-link">{linkLabel(ad.url)} -&gt;</span>
        </span>
      </span>
      <span className="ad-card-headline">{ad.headline}</span>
      <ScoreTag {...ad} className="ad-card-score" />
    </a>
  )
}

type EmptyCardProps = {
  settings: AdsResponse
  onBuy: () => void
}

// The free spot at the end of a column, to place an ad.
export function AdEmptyCard({ settings, onBuy }: EmptyCardProps) {
  return (
    <button type="button" className="ad-card ad-card-empty" onClick={onBuy}>
      <strong>+ Your ad here</strong>
      <span>
        Your score next to your link. ${settings.priceUsd} for {settings.days} days.
      </span>
    </button>
  )
}

// An empty card that holds the ad's place until the ads have loaded.
export function AdPlaceholder() {
  return <div className="ad-card ad-card-placeholder" aria-hidden="true" />
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
          href={ad.url}
          target="_blank"
          rel={SPONSORED}
          tabIndex={copy === 0 ? 0 : -1}
        >
          {ad.imageUrl && <img src={ad.imageUrl} alt="" width={20} height={20} />}
          <ScoreTag {...ad} className="ticker-tag" />
          <strong>{ad.name}</strong> {ad.headline}
        </a>
      ) : (
        <button
          key={`${copy}-${index}`}
          type="button"
          className="ticker-item ticker-ad"
          onClick={onBuy}
          tabIndex={copy === 0 ? 0 : -1}
        >
          <span className="ticker-tag">[ Your ad here ]</span>${settings.priceUsd} for{' '}
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
  larpPercent: number
  settings: AdsResponse | null
  canPlaceAd: boolean
  onBuy: () => void
  onShare: () => void
}

// Under the verdict: show the score off with an ad, or share the score card.
export function ScoreOffer({ larpPercent, settings, canPlaceAd, onBuy, onShare }: OfferProps) {
  const zone = larpZone(larpPercent)
  const score = <strong style={{ color: zone.color }}>{larpPercent}% larp</strong>

  return (
    <section className="offer">
      <p className="kicker">Is this you?</p>
      <h2>{larpPercent < 40 ? 'Sharp. Show it off.' : 'Own the larp.'}</h2>
      {canPlaceAd && settings ? (
        <p>
          Put your {score} next to your LinkedIn, your startup or your site (${settings.priceUsd}{' '}
          for {settings.days} days), or share the score card.
        </p>
      ) : (
        <p>Share your {score}: a card with the score, the meter and the roast.</p>
      )}
      <div className="offer-actions">
        {canPlaceAd && (
          <button type="button" onClick={onBuy}>
            Place my ad
          </button>
        )}
        <button type="button" onClick={onShare}>
          Share
        </button>
      </div>
    </section>
  )
}

type ImagePickerProps = {
  image: string | null
  disabled: boolean
  onChange: (image: string | null) => void
  onError: (message: string | null) => void
}

// Picks the ad's optional image, shrinks it, and shows it with a × to remove it.
function AdImagePicker({ image, disabled, onChange, onError }: ImagePickerProps) {
  const [reading, setReading] = useState(false)

  // Turns the chosen file into a small square JPEG.
  async function handleFile(file: File | undefined) {
    if (!file) {
      return
    }
    setReading(true)
    onError(null)
    try {
      onChange(await toAdImage(file))
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="ad-image">
      {image ? (
        <img src={`data:image/jpeg;base64,${image}`} alt="Your ad's image" width={56} height={56} />
      ) : (
        <span className="ad-image-empty" aria-hidden="true">
          +
        </span>
      )}
      <label className="ad-image-pick">
        <input
          type="file"
          accept="image/*"
          disabled={disabled || reading}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            handleFile(file)
          }}
        />
        {reading ? 'Reading…' : image ? 'Change image' : 'Add a logo or photo'}
      </label>
      {image && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          Remove
        </button>
      )}
    </div>
  )
}

type FormProps = {
  score: AdScore
  settings: AdsResponse
  onClose: () => void
}

// The form to place an ad with a check's score: it sends the visitor to Stripe.
export function AdForm({ score, settings, onClose }: FormProps) {
  const [ad, setAd] = useState<AdText>({ name: '', headline: '', url: '' })
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const zone = larpZone(score.larpPercent)
  const {
    container: humanCheckBox,
    token: humanToken,
    needsClick: humanCheckNeedsClick,
    reset: resetHumanCheck,
  } = useTurnstile('checkout')

  useEffect(() => {
    // Closes the form when Escape is pressed.
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  // Creates the Stripe payment page and moves the visitor there.
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!humanToken) {
      setError("Still checking you're not a bot. Try again in a second.")
      return
    }
    setSending(true)
    setError(null)

    try {
      const request = { ...ad, checkId: score.checkId, imageJpeg: image }
      const { url } = await startAdCheckout(request, humanToken)
      window.location.assign(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setSending(false)
      resetHumanCheck()
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="ad-form-title">
      <form className="sheet ad-form" onSubmit={handleSubmit}>
        <div className="sheet-head">
          <h2 id="ad-form-title">Place your ad</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="ad-form-score">
          <strong style={{ color: zone.color }}>{score.larpPercent}% larp</strong>
          <span>
            {score.githubLogin ? `@${score.githubLogin}` : 'From your CV'} · comes from your
            check, can't be edited
          </span>
        </div>

        <p className="ad-form-intro">
          ${settings.priceUsd} for {settings.days} days. Your name, your score and your link sit
          next to every check, in front of students, founders and recruiters.
        </p>

        <label>
          Name
          <input
            value={ad.name}
            onChange={(event) => setAd({ ...ad, name: event.target.value })}
            placeholder="Your name or your startup's"
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
          Link
          <input
            value={ad.url}
            onChange={(event) => setAd({ ...ad, url: event.target.value })}
            placeholder="linkedin.com/in/you, your startup, your site"
            maxLength={200}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <div className="ad-form-field">
          <span>Image (optional)</span>
          <AdImagePicker
            image={image}
            disabled={sending}
            onChange={setImage}
            onError={setError}
          />
        </div>

        <div
          ref={humanCheckBox}
          className={humanCheckNeedsClick ? 'human-check open' : 'human-check'}
        />

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
