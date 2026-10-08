import { useState, type SubmitEvent } from 'react'
import type { AnalyzeResponse } from '../worker/types.ts'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_github: "That doesn't look like a GitHub profile link.",
  github_user_not_found: 'No GitHub user with that name.',
  github_failed: 'GitHub is not answering. Try again in a minute.',
}
const FALLBACK_ERROR = 'Something went wrong. Try again.'

// Sends the GitHub link to the API and returns its answer, or throws a message.
async function analyzeGithub(github: string): Promise<AnalyzeResponse> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ github }),
  })
  const body = await response.json().catch(() => null)

  if (!response.ok || !body) {
    throw new Error(ERROR_MESSAGES[body?.error] ?? FALLBACK_ERROR)
  }
  return body
}

// The page: a title, a GitHub link field and the profile it finds.
export default function App() {
  const [github, setGithub] = useState('')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Runs the analysis when the form is sent and stores the answer or the error.
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      setResult(await analyzeGithub(github))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : FALLBACK_ERROR)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page">
      <h1>sharp-or-larp</h1>

      <form className="search" onSubmit={handleSubmit}>
        <input
          value={github}
          onChange={(event) => setGithub(event.target.value)}
          placeholder="https://github.com/username"
          aria-label="GitHub link"
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Checking…' : 'Check'}
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="profile">
          <img src={result.avatarUrl} alt="" width={120} height={120} />
          <p>@{result.login}</p>
        </section>
      )}
    </main>
  )
}
