import { useEffect, useState, type SubmitEvent } from 'react'
import type { AdsResponse, AnalyzeResponse, Board } from '../worker/types.ts'
import { AdCard, AdEmptyCard, AdForm, AdPlaceholder, AdStrip } from './AdSlots.tsx'
import { analyzeProfile, errorMessage, fetchAds } from './api.ts'
import CvPicker, { type PickedCv } from './CvPicker.tsx'
import LarpMeter from './LarpMeter.tsx'
import Leaderboard, { AddToLeaderboard } from './Leaderboard.tsx'
import LoadingPhrase from './LoadingPhrase.tsx'
import ScoreOffer from './ScoreOffer.tsx'
import ShareSheet from './ShareSheet.tsx'
import { CONTACT_EMAIL } from './Terms.tsx'
import { useLeaderboard } from './useLeaderboard.ts'
import { useTurnstile } from './useTurnstile.ts'
import Verdict from './Verdict.tsx'
import VerdictFlash from './VerdictFlash.tsx'
import { larpZone } from './zones.ts'

const ADS_ENABLED = true
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
  const [loading, setLoading] = useState(false)
  const [adSettings, setAdSettings] = useState<AdsResponse | null | undefined>(
    ADS_ENABLED ? undefined : null,
  )
  const [buyingAd, setBuyingAd] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [paymentReturn] = useState(readPaymentReturn)
  const [boardSort, setBoardSort] = useState<Board>('sharpest')
  const [boardMinRows, setBoardMinRows] = useState(0)
  const [boardVersion, setBoardVersion] = useState(0)
  const board = useLeaderboard(boardSort, boardMinRows, boardVersion)
  const {
    container: humanCheckBox,
    needsClick: humanCheckNeedsClick,
    waitForToken: waitForHumanToken,
    reset: resetHumanCheck,
  } = useTurnstile('analyze')

  useEffect(() => {
    if (!ADS_ENABLED) {
      return
    }
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

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const humanToken = await waitForHumanToken()
      if (!humanToken) {
        throw new Error(errorMessage('bot_check_failed'))
      }
      setResult(await analyzeProfile(github.trim() || null, cv?.input ?? null, humanToken))
      setBoardVersion((version) => version + 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
      resetHumanCheck()
    }
  }

  const verdict = result?.verdict
  const rankableCheckId = result?.login ? result.checkId : null

  // Opens the form to buy an ad spot: anyone can, no check needed.
  function openAdForm() {
    setBuyingAd(true)
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
        {ADS_ENABLED && (
          <aside className="ads" aria-label="Ads">
            {adColumn(0)}
          </aside>
        )}

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
              canRank={rankableCheckId !== null}
              onShare={() => setSharing(true)}
            >
              {rankableCheckId && (
                <AddToLeaderboard
                  key={rankableCheckId}
                  checkId={rankableCheckId}
                  onAdded={(added) => {
                    setBoardSort(added.board)
                    setBoardMinRows(added.rank)
                    setBoardVersion((version) => version + 1)
                  }}
                />
              )}
            </ScoreOffer>
          )}

          <Leaderboard
            entries={board.entries}
            hasMore={board.hasMore}
            loadingMore={board.loadingMore}
            error={board.error}
            sort={boardSort}
            highlightLogin={result?.login ?? null}
            onSort={(sort) => {
              setBoardSort(sort)
              setBoardMinRows(0)
            }}
            onMore={board.loadMore}
          />

          <SiteFooter />
        </main>

        {ADS_ENABLED && (
          <aside className="ads" aria-label="Ads">
            {adColumn(1)}
          </aside>
        )}
      </div>

      {adSettings && (
        <AdStrip
          ads={[...ads].reverse()}
          settings={adSettings}
          position="bottom"
          onBuy={openAdForm}
        />
      )}

      {buyingAd && adSettings && (
        <AdForm settings={adSettings} onClose={() => setBuyingAd(false)} />
      )}

      {sharing && result && <ShareSheet result={result} onClose={() => setSharing(false)} />}
    </div>
  )
}
