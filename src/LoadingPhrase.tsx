import { useEffect, useState } from 'react'

const PHRASES = [
  'Checking for larp…',
  'Cooking…',
  'Counting the stars…',
  'Reading their READMEs…',
  'Following the follows…',
  'Sniffing out buzzwords…',
  'Scrolling the commit history…',
  'Grepping for "visionary"…',
  'Checking if the todo app is a startup…',
  'Weighing the green squares…',
  'Looking for actual code…',
  'Auditing the aura…',
  'Calibrating the LARP meter…',
  'Asking the senior devs…',
  'Detecting LinkedIn energy…',
  'Separating builders from talkers…',
  'Verifying the hype…',
  'Opening the pinned repos…',
  'Measuring the sauce…',
  'Reading between the badges…',
]
const CHANGE_EVERY_MS = 2000

// Picks a random phrase, never the same one twice in a row.
function nextPhrase(current: string): string {
  const others = PHRASES.filter((phrase) => phrase !== current)
  return others[Math.floor(Math.random() * others.length)]
}

// A line of text that swaps for a new random phrase every two seconds.
export default function LoadingPhrase() {
  const [phrase, setPhrase] = useState(() => nextPhrase(''))

  useEffect(() => {
    const timer = setInterval(() => setPhrase(nextPhrase), CHANGE_EVERY_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <p key={phrase} className="loading-phrase" aria-live="polite">
      {phrase}
    </p>
  )
}
