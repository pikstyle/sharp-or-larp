import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import type { AdsResponse, AnalyzeResponse } from '../worker/types.ts'
import { AdCard, AdForm, AdOffer, AdStrip, type AdScore } from './AdSlots.tsx'
import { analyzeProfile, fetchAds } from './api.ts'
import CvPicker, { type PickedCv } from './CvPicker.tsx'
import LarpMeter from './LarpMeter.tsx'
import LoadingPhrase from './LoadingPhrase.tsx'
import { CONTACT_EMAIL } from './Terms.tsx'
import { useTurnstile } from './useTurnstile.ts'

// Reads ?ad=success once when Stripe sends the buyer back, then cleans the URL.
function readPaymentReturn(): 'success' | null {
  const params = new URLSearchParams(window.location.search)
  const status = params.get('ad')

  if (status) {
    window.history.replaceState(null, '', window.location.pathname)
  }
  return status === 'success' ? 'success' : null
}

// The page: the form, the LARP meter, the verdict, and ad slots around them.
export default function App() {
  const [github, setGithub] = useState('')
  const [cv, setCv] = useState<PickedCv | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [adSettings, setAdSettings] = useState<AdsResponse | null>(null)
  const [buyingAd, setBuyingAd] = useState(false)
  const [paymentReturn] = useState(readPaymentReturn)
  const githubInput = useRef<HTMLInputElement>(null)
  const { container: humanCheckBox, token: humanToken, reset: resetHumanCheck } =
    useTurnstile('analyze')

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

  const slots = adSettings?.slots ?? 0
  const ads = adSettings?.ads ?? []
  const freeSlots = Math.max(0, slots - ads.length)
  const half = Math.ceil(slots / 2)
  const cards = adSettings
    ? Array.from({ length: slots }, (_, index) => (
        <AdCard
          key={index}
          ad={ads[index]}
          settings={adSettings}
          freeSlots={freeSlots}
          onBuy={openAdForm}
        />
      ))
    : []

  return (
    <div className="app">
      {adSettings && (
        <AdStrip
          ads={ads}
          settings={adSettings}
          position="top"
          onBuy={openAdForm}
        />
      )}

      <div className="layout">
        <aside className="ads" aria-label="Ads">
          {cards.slice(0, half)}
        </aside>

        <main className="page">
          {paymentReturn && (
            <p className="banner" role="status">
              Payment received. Your profile shows up here within a minute.
            </p>
          )}

          <header className="hero">
            <h1>
              sharp<span>-or-</span>larp
            </h1>
            <p className="tagline">
              Drop a GitHub link or a CV. Find out if they're sharp or larping.
            </p>
          </header>

          <form className="search" onSubmit={handleSubmit}>
            <div className="search-row">
              <input
                ref={githubInput}
                value={github}
                onChange={(event) => setGithub(event.target.value)}
                placeholder="github.com/username"
                aria-label="GitHub link"
                maxLength={200}
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Checking…' : 'Check'}
              </button>
            </div>
            <CvPicker cv={cv} disabled={loading} onChange={setCv} onError={setError} />
            <div ref={humanCheckBox} className="human-check" />
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

          {result && verdict && (
            <section className="verdict">
              <div className="profile">
                {result.login && result.avatarUrl ? (
                  <>
                    <img src={result.avatarUrl} alt="" width={56} height={56} />
                    <a href={`https://github.com/${result.login}`} target="_blank" rel="noreferrer">
                      @{result.login}
                    </a>
                  </>
                ) : (
                  <span className="kicker">Judged on the CV only</span>
                )}
              </div>

              <blockquote className="roast">{verdict.roast}</blockquote>

              <div className="flags">
                <div className="flags-red">
                  <h2 className="kicker">Red flags</h2>
                  <ul>
                    {verdict.redFlags.map((flag) => (
                      <li key={flag}>{flag}</li>
                    ))}
                    {verdict.redFlags.length === 0 && <li className="muted">None found</li>}
                  </ul>
                </div>
                <div className="flags-green">
                  <h2 className="kicker">Green flags</h2>
                  <ul>
                    {verdict.greenFlags.map((flag) => (
                      <li key={flag}>{flag}</li>
                    ))}
                    {verdict.greenFlags.length === 0 && <li className="muted">None found</li>}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {score && adSettings && (
            <AdOffer
              score={score}
              settings={adSettings}
              freeSlots={freeSlots}
              onBuy={openAdForm}
            />
          )}

          <footer className="site-footer">
            <a href="/terms">Terms & refunds</a>
            <span aria-hidden="true">·</span>
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
          </footer>
        </main>

        <aside className="ads" aria-label="Ads">
          {cards.slice(half)}
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
    </div>
  )
}
