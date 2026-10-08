import { useEffect, useState, type SubmitEvent } from 'react'
import type { AdsResponse, AnalyzeResponse } from '../worker/types.ts'
import { AdCard, AdForm, AdStrip } from './AdSlots.tsx'
import { analyzeProfile, fetchAds } from './api.ts'
import LarpMeter from './LarpMeter.tsx'
import LoadingPhrase from './LoadingPhrase.tsx'
import { readCv } from './readCv.ts'

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
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [adSettings, setAdSettings] = useState<AdsResponse | null>(null)
  const [buyingAd, setBuyingAd] = useState(false)
  const [paymentReturn] = useState(readPaymentReturn)

  useEffect(() => {
    fetchAds()
      .then(setAdSettings)
      .catch(() => setAdSettings(null))
  }, [])

  // Reads the optional CV, asks for the verdict and shows it or the error.
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!github.trim() && !cvFile) {
      setError('Add a GitHub link, a CV, or both.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const cv = cvFile ? await readCv(cvFile) : null
      setResult(await analyzeProfile(github.trim() || null, cv))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  const verdict = result?.verdict
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
          onBuy={() => setBuyingAd(true)}
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
          onBuy={() => setBuyingAd(true)}
        />
      )}

      <div className="layout">
        <aside className="ads" aria-label="Classifieds">
          <p className="kicker ads-title">Classifieds</p>
          {cards.slice(0, half)}
        </aside>

        <main className="page">
          {paymentReturn && (
            <p className="banner" role="status">
              Payment received. Your profile shows up here within a minute.
            </p>
          )}

          <header className="hero">
            <p className="kicker">The LARP meter</p>
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
            <label className="cv-picker">
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setCvFile(event.target.files?.[0] ?? null)}
              />
              {cvFile ? `CV: ${cvFile.name}` : '+ Add a CV or LinkedIn PDF'}
            </label>
          </form>

          {error && (
            <p className="error" role="alert">
              {error}
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
        </main>

        <aside className="ads" aria-label="Classifieds">
          <p className="kicker ads-title">Open to work</p>
          {cards.slice(half)}
        </aside>
      </div>

      {adSettings && (
        <AdStrip
          ads={[...ads].reverse()}
          settings={adSettings}
          position="bottom"
          onBuy={() => setBuyingAd(true)}
        />
      )}

      {buyingAd && adSettings && (
        <AdForm settings={adSettings} onClose={() => setBuyingAd(false)} />
      )}
    </div>
  )
}
