import { useEffect, useState, type SubmitEvent } from 'react'
import type { Ad, AdsResponse, AdText } from '../worker/types.ts'
import { toAdImage } from './adImage.ts'
import { errorMessage, startAdCheckout } from './api.ts'
import { useTurnstile } from './useTurnstile.ts'

const MIN_TICKER_ITEMS = 6
const SPONSORED = 'noopener noreferrer nofollow sponsored'

type LogoProps = {
  ad: Ad
  size: number
}

// An ad's logo: its image, or the first letter of its name.
function AdLogo({ ad, size }: LogoProps) {
  if (ad.imageUrl) {
    return <img src={ad.imageUrl} alt="" width={size} height={size} />
  }
  return (
    <span className="ad-initial" style={{ width: size, height: size }} aria-hidden="true">
      {ad.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

type CardProps = {
  ad: Ad
}

// One running ad in a side column: logo, name and headline, on a sharp green tint.
export function AdCard({ ad }: CardProps) {
  return (
    <a className="ad-card" href={ad.url} target="_blank" rel={SPONSORED}>
      <AdLogo ad={ad} size={36} />
      <strong>{ad.name}</strong>
      <span className="ad-card-headline">{ad.headline}</span>
    </a>
  )
}

type EmptyCardProps = {
  onBuy: () => void
}

// The free spot at the end of a column: a + to click and what an ad gets.
export function AdEmptyCard({ onBuy }: EmptyCardProps) {
  return (
    <button type="button" className="ad-card ad-card-empty" onClick={onBuy}>
      <span className="ad-plus" style={{ width: 36, height: 36 }} aria-hidden="true">
        +
      </span>
      <strong>Own the spot!</strong>
      <span className="ad-card-headline">Your link, seen by everyone</span>
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

// A ticker of ad boxes (logo, name, headline) scrolling on phones, top or bottom.
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
          <AdLogo ad={ad} size={28} />
          <span className="ticker-text">
            <strong>{ad.name}</strong>
            <span>{ad.headline}</span>
          </span>
        </a>
      ) : (
        <button
          key={`${copy}-${index}`}
          type="button"
          className="ticker-item ticker-free"
          onClick={onBuy}
          tabIndex={copy === 0 ? 0 : -1}
        >
          <span className="ad-plus" style={{ width: 28, height: 28 }} aria-hidden="true">
            +
          </span>
          <span className="ticker-text">
            <strong>Own the spot!</strong>
            <span>Your link, seen by everyone.</span>
          </span>
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
  settings: AdsResponse
  onClose: () => void
}

// The form to place an ad: it sends the visitor to Stripe.
export function AdForm({ settings, onClose }: FormProps) {
  const [ad, setAd] = useState<AdText>({ name: '', headline: '', url: '' })
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const {
    container: humanCheckBox,
    needsClick: humanCheckNeedsClick,
    waitForToken: waitForHumanToken,
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
    setSending(true)
    setError(null)

    try {
      const humanToken = await waitForHumanToken()
      if (!humanToken) {
        throw new Error(errorMessage('bot_check_failed'))
      }
      const request = { ...ad, imageJpeg: image }
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

        <p className="ad-form-intro">
          ${settings.priceUsd} for {settings.days} days. Your name and your link sit next to every
          check, in front of students, founders and recruiters.
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
            maxLength={50}
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
