const CENTER_X = 170
const CENTER_Y = 170
const RADIUS = 130
const BAND_WIDTH = 52
const NEEDLE_LENGTH = 120

const ZONES = [
  { name: 'Low', color: '#4f9d5d', text: '#f4f1ea' },
  { name: 'Moderate', color: '#d8b64a', text: '#3b2f00' },
  { name: 'High', color: '#d98a3a', text: '#3d2200' },
  { name: 'Extreme', color: '#c9483c', text: '#f4f1ea' },
  { name: 'LARP god', color: '#7e1f2e', text: '#f4f1ea' },
]

type Props = {
  percent: number
  searching: boolean
  showReading: boolean
}

// Gives the point on the dial at this radius and angle (180° is far left).
function pointAt(radius: number, degrees: number): string {
  const radians = (degrees * Math.PI) / 180
  return `${CENTER_X + radius * Math.cos(radians)} ${CENTER_Y - radius * Math.sin(radians)}`
}

// Draws the arc of one zone, left to right, so its label reads upright.
function zoneArc(index: number): string {
  const from = 180 - index * 36 - 0.4
  const to = 180 - (index + 1) * 36 + 0.4
  return `M ${pointAt(RADIUS, from)} A ${RADIUS} ${RADIUS} 0 0 1 ${pointAt(RADIUS, to)}`
}

// The LARP meter: five colored zones and a needle that swings to the score.
export default function LarpMeter({ percent, searching, showReading }: Props) {
  const zone = ZONES[Math.min(ZONES.length - 1, Math.floor(percent / 20))]
  const label = showReading ? `LARP meter: ${percent}% larp, ${zone.name}` : 'LARP meter'

  return (
    <figure className="meter">
      <svg viewBox="0 0 340 196" role="img" aria-label={label}>
        <defs>
          {ZONES.map((_, index) => (
            <path key={index} id={`zone-${index}`} d={zoneArc(index)} />
          ))}
        </defs>

        {ZONES.map((current, index) => (
          <g key={current.name}>
            <use
              href={`#zone-${index}`}
              fill="none"
              stroke={current.color}
              strokeWidth={BAND_WIDTH}
              opacity={showReading && current !== zone ? 0.45 : 1}
            />
            <text className="zone-label" fill={current.text} dy="4">
              <textPath href={`#zone-${index}`} startOffset="50%" textAnchor="middle">
                {current.name}
              </textPath>
            </text>
          </g>
        ))}

        <g
          className={searching ? 'needle searching' : 'needle'}
          style={{ transform: `rotate(${percent * 1.8}deg)` }}
        >
          <polygon
            points={`${CENTER_X - NEEDLE_LENGTH},${CENTER_Y} ${CENTER_X},${CENTER_Y - 7} ${CENTER_X},${CENTER_Y + 7}`}
          />
        </g>
        <circle className="needle-hub" cx={CENTER_X} cy={CENTER_Y} r="16" />
        <circle className="needle-pin" cx={CENTER_X} cy={CENTER_Y} r="6" />
      </svg>

      {showReading && (
        <figcaption className="meter-reading">
          <strong style={{ color: zone.color }}>{percent}%</strong>
          <span>larp · {zone.name}</span>
        </figcaption>
      )}
    </figure>
  )
}
