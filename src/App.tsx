import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import type { AdsResponse, AnalyzeResponse } from '../worker/types.ts'
import {
  AdCard,
  AdEmptyCard,
  AdForm,
  AdPlaceholder,
  AdStrip,
  ScoreOffer,
  type AdScore,
} from './AdSlots.tsx'
import { analyzeProfile, fetchAds } from './api.ts'
import CvPicker, { type PickedCv } from './CvPicker.tsx'
import LarpMeter from './LarpMeter.tsx'
import LoadingPhrase from './LoadingPhrase.tsx'
import ShareSheet from './ShareSheet.tsx'
import { CONTACT_EMAIL } from './Terms.tsx'
import { useTurnstile } from './useTurnstile.ts'
import Verdict from './Verdict.tsx'
import VerdictFlash from './VerdictFlash.tsx'
import { larpZone } from './zones.ts'

const PLACEHOLDERS_PER_COLUMN = 2
const AUTHOR_URL = 'https://simon-mounier.com'

// Reads ?ad=success once when Stripe sends the buyer back, then cleans the URL.
function readPaymentReturn(): 'success' | null {
  const params = new URLSearchParams(window.location.search)
  const status = params.get('ad')

  if (status) {
    window.history.replaceState(null, '', window.location.pathname)
  }
  return status === 'success' ? 'success' : null
}

// The bottom of the page: the links, and who built it.
function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="footer-links">
        <a href="/terms">[terms]</a>
        <a href={`mailto:${CONTACT_EMAIL}`}>[contact]</a>
        <a className="built-by" href={AUTHOR_URL} target="_blank" rel="noopener">
          built by <span>jeune sim</span>
        </a>
      </nav>
    </footer>
  )
}

// The page: the form, the LARP meter, the verdict, and ad slots around them.
export default function App() {
  const [github, setGithub] = useState('')
  const [cv, setCv] = useState<PickedCv | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [adSettings, setAdSettings] = useState<AdsResponse | null | undefined>(undefined)
  const [buyingAd, setBuyingAd] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [paymentReturn] = useState(readPaymentReturn)
  const githubInput = useRef<HTMLInputElement>(null)
  const {
    container: humanCheckBox,
    token: humanToken,
    needsClick: humanCheckNeedsClick,
    reset: resetHumanCheck,
  } = useTurnstile('analyze')

  useEffect(() => {
    fetchAds()
      .then(setAdSettings)
      .catch(() => setAdSettings(null))
  }, [])

  // Reads the optional CV, asks for the verdict and shows it or the error.
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!github.trim() && !cv) {
      setError('Add a GitHub link, a CV, or both.')
      return
    }
    if (!humanToken) {
      setError("Still checking you're not a bot. Try again in a second.")
      return
    }

    setLoading(true)
    setError(null)
    setHint(null)
    setResult(null)
    try {
      setResult(await analyzeProfile(github.trim() || null, cv?.input ?? null, humanToken))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
      resetHumanCheck()
    }
  }

  const verdict = result?.verdict
  const score: AdScore | null =
    result?.checkId && verdict
      ? { checkId: result.checkId, larpPercent: verdict.larpPercent, githubLogin: result.login }
      : null

  // Opens the ad form with this score, or asks for a check first: ads show one.
  function openAdForm() {
    if (score) {
      setBuyingAd(true)
      return
    }
    setHint('Run a check first: your ad shows your LARP score.')
    githubInput.current?.focus()
  }

  const adsLoading = adSettings === undefined
  const ads = adSettings?.ads ?? []
  const freeSlots = Math.max(0, (adSettings?.slots ?? 0) - ads.length)

  // Fills one side column: every other ad, then one free spot if any is left.
  function adColumn(side: 0 | 1) {
    if (adsLoading) {
      return Array.from({ length: PLACEHOLDERS_PER_COLUMN }, (_, index) => (
        <AdPlaceholder key={index} />
      ))
    }
    const cards = ads
      .filter((_, index) => index % 2 === side)
      .map((ad, index) => <AdCard key={index} ad={ad} />)
    if (adSettings && freeSlots > 0) {
      cards.push(<AdEmptyCard key="free" settings={adSettings} onBuy={openAdForm} />)
    }
    return cards
  }

  return (
    <div className="app">
      {result && verdict && (
        <VerdictFlash
          key={result.checkId ?? verdict.roast}
          color={larpZone(verdict.larpPercent).color}
        />
      )}
      {adSettings && (
        <AdStrip ads={ads} settings={adSettings} position="top" onBuy={openAdForm} />
      )}
      {adsLoading && <div className="ticker ticker-top" aria-hidden="true" />}

      <div className="layout">
        <aside className="ads" aria-label="Ads">
          <p className="ads-label">Sponsored</p>
          {adColumn(0)}
        </aside>

        <main className="page">
          {paymentReturn && (
            <p className="banner" role="status">
              Payment received. Your ad shows up here within a minute.
            </p>
          )}

          <header className="hero">
            <h1>
              Sharp <span>or</span> Larp
            </h1>
            <p className="tagline">
              Drop a GitHub link or a CV. Find out if they're sharp or larping.
            </p>
          </header>

          <form className="search" role="search" autoComplete="off" onSubmit={handleSubmit}>
            <div className="search-row">
              <input
                ref={githubInput}
                value={github}
                onChange={(event) => setGithub(event.target.value)}
                name="github-profile"
                type="text"
                inputMode="url"
                placeholder="github.com/torvalds"
                aria-label="GitHub profile link"
                maxLength={200}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Checking…' : 'Check ->'}
              </button>
            </div>
            <CvPicker cv={cv} disabled={loading} onChange={setCv} onError={setError} />
            <div
              ref={humanCheckBox}
              className={humanCheckNeedsClick ? 'human-check open' : 'human-check'}
            />
          </form>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {hint && !error && (
            <p className="hint" role="status">
              {hint}
            </p>
          )}

          <LarpMeter
            percent={verdict?.larpPercent ?? 0}
            searching={loading}
            showReading={Boolean(verdict)}
          />

          {loading && <LoadingPhrase />}

          {result && <Verdict result={result} />}

          {verdict && (
            <ScoreOffer
              larpPercent={verdict.larpPercent}
              settings={adSettings ?? null}
              canPlaceAd={score !== null && freeSlots > 0}
              onBuy={openAdForm}
              onShare={() => setSharing(true)}
            />
          )}

          <SiteFooter />
        </main>

        <aside className="ads" aria-label="Ads">
          <p className="ads-label">Sponsored</p>
          {adColumn(1)}
        </aside>
      </div>

      {adSettings && (
        <AdStrip
          ads={[...ads].reverse()}
          settings={adSettings}
          position="bottom"
          onBuy={openAdForm}
        />
      )}

      {buyingAd && adSettings && score && (
        <AdForm score={score} settings={adSettings} onClose={() => setBuyingAd(false)} />
      )}

      {sharing && result && <ShareSheet result={result} onClose={() => setSharing(false)} />}
    </div>
  )
}
