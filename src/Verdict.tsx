import type { AnalyzeResponse } from '../worker/types.ts'

type FlagListProps = {
  title: string
  sign: string
  tone: 'red' | 'green'
  flags: string[]
}

// One column of flags, each line marked like a diff: − for red, + for green.
function FlagList({ title, sign, tone, flags }: FlagListProps) {
  return (
    <div className={`flag-list flag-list-${tone}`}>
      <h2>{title}</h2>
      <ul>
        {flags.map((flag) => (
          <li key={flag}>
            <span className="flag-sign" aria-hidden="true">
              {sign}
            </span>
            {flag}
          </li>
        ))}
        {flags.length === 0 && <li className="muted">None found</li>}
      </ul>
    </div>
  )
}

type Props = {
  result: AnalyzeResponse
}

// The verdict under the meter: who was checked, the roast and the flags.
export default function Verdict({ result }: Props) {
  const { verdict } = result

  return (
    <section className="verdict">
      {result.login && result.avatarUrl && (
        <a
          className="profile"
          href={`https://github.com/${result.login}`}
          target="_blank"
          rel="noreferrer"
        >
          <img src={result.avatarUrl} alt="" width={28} height={28} />@{result.login}
        </a>
      )}

      <blockquote className="roast">{verdict.roast}</blockquote>

      <div className="flags">
        <FlagList title="Red flags" sign="−" tone="red" flags={verdict.redFlags} />
        <FlagList title="Green flags" sign="+" tone="green" flags={verdict.greenFlags} />
      </div>
    </section>
  )
}
