import { useEffect, useState } from 'react'
import type { AnalyzeResponse } from '../worker/types.ts'
import { drawShareCard } from './shareCard.ts'
import { larpZone } from './zones.ts'

const SITE_URL = 'https://sharporlarp.com'
const LINKEDIN_COMPOSE_URL = 'https://www.linkedin.com/feed/?shareActive=true&text='

type Card = {
  file: File
  url: string
}

type Props = {
  result: AnalyzeResponse
  onClose: () => void
}

// Writes the post that goes with the card, e.g. "12% larp (Sharp) on the LARP meter".
function shareText(result: AnalyzeResponse): string {
  const { larpPercent } = result.verdict
  const zone = larpZone(larpPercent).name
  return `${larpPercent}% larp (${zone}) on the LARP meter. Sharp or larping? Check yours: ${SITE_URL}`
}

// Saves the card image to the visitor's device.
function downloadCard(card: Card) {
  const link = document.createElement('a')
  link.href = card.url
  link.download = card.file.name
  link.click()
}

// The share sheet: a preview of the score card and the ways to post it.
export default function ShareSheet({ result, onClose }: Props) {
  const [card, setCard] = useState<Card | null>(null)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const text = shareText(result)
  const canShareFiles = card !== null && navigator.canShare?.({ files: [card.file] }) === true

  useEffect(() => {
    let url: string | null = null
    let cancelled = false

    drawShareCard(result)
      .then((blob) => {
        if (cancelled) {
          return
        }
        const name = `sharp-or-larp-${result.login ?? 'cv'}.png`
        url = URL.createObjectURL(blob)
        setCard({ file: new File([blob], name, { type: 'image/png' }), url })
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })

    return () => {
      cancelled = true
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [result])

  useEffect(() => {
    // Closes the sheet when Escape is pressed.
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  // Saves the card, then opens LinkedIn with the post already written.
  function postOnLinkedin() {
    if (!card) {
      return
    }
    downloadCard(card)
    window.open(`${LINKEDIN_COMPOSE_URL}${encodeURIComponent(text)}`, '_blank', 'noopener')
    setNotice('The card is downloaded. Add it to your LinkedIn post.')
  }

  // Opens the phone's share menu with the card and the text.
  async function shareWithDevice() {
    if (!card) {
      return
    }
    await navigator.share({ files: [card.file], text }).catch(() => null)
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="sheet share-sheet">
        <div className="sheet-head">
          <h2 id="share-title">Share this score</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="share-preview">
          {card && <img src={card.url} alt={`Score card: ${text}`} />}
          {!card && !failed && <p className="muted">Drawing the card…</p>}
          {failed && <p className="error">Couldn't draw the card. Try again.</p>}
        </div>

        <p className="share-text">{text}</p>

        <div className="share-actions">
          <button type="button" onClick={postOnLinkedin} disabled={!card}>
            Post on LinkedIn
          </button>
          {canShareFiles && (
            <button type="button" className="secondary" onClick={shareWithDevice}>
              Share…
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => card && downloadCard(card)}
            disabled={!card}
          >
            Download
          </button>
        </div>

        {notice && (
          <p className="share-notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </div>
  )
}
