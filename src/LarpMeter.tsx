import { dialTicks, pointAt, zoneDegrees } from './gauge.ts'
import { larpZone, ZONES } from './zones.ts'

const CX = 170
const CY = 176
const TICK_OUTER = 148
const TICK_INNER = 114
const MAJOR_TICK_INNER = 106
const LABEL_RADIUS = 162
const NEEDLE_LENGTH = 116
const TICKS = dialTicks()

type Props = {
  percent: number
  searching: boolean
  showReading: boolean
}

// Draws the arc a zone's label runs along, left to right so it reads upright.
function labelArc(index: number): string {
  const { from, to } = zoneDegrees(index)
  const start = pointAt(CX, CY, LABEL_RADIUS, from)
  const end = pointAt(CX, CY, LABEL_RADIUS, to)
  return `M ${start.x} ${start.y} A ${LABEL_RADIUS} ${LABEL_RADIUS} 0 0 1 ${end.x} ${end.y}`
}

// The LARP meter: thick ticks that light up to the score, and a needle.
export default function LarpMeter({ percent, searching, showReading }: Props) {
  const zone = larpZone(percent)
  const label = showReading ? `LARP meter: ${percent}% larp, ${zone.name}` : 'LARP meter'

  return (
    <figure className="meter">
      <svg viewBox="-12 -16 364 212" role="img" aria-label={label}>
        <defs>
          {ZONES.map((_, index) => (
            <path key={index} id={`zone-label-${index}`} d={labelArc(index)} />
          ))}
        </defs>

        {TICKS.map((tick, index) => {
          const outer = pointAt(CX, CY, TICK_OUTER, tick.degrees)
          const inner = pointAt(CX, CY, tick.major ? MAJOR_TICK_INNER : TICK_INNER, tick.degrees)
          const lit = showReading && tick.percent <= percent
          return (
            <line
              key={tick.percent}
              className={lit ? 'tick lit' : 'tick'}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={larpZone(tick.percent).color}
              strokeWidth={tick.major ? 6.5 : 5}
              style={lit ? { transitionDelay: `${index * 16}ms` } : undefined}
            />
          )
        })}

        {ZONES.map((current, index) => (
          <text
            key={current.name}
            className={showReading && current === zone ? 'zone-label active' : 'zone-label'}
            fill={showReading && current === zone ? current.color : undefined}
          >
            <textPath href={`#zone-label-${index}`} startOffset="50%" textAnchor="middle">
              {current.name}
            </textPath>
          </text>
        ))}

        <g
          className={searching ? 'needle searching' : 'needle'}
          style={{ transform: `rotate(${percent * 1.8}deg)` }}
        >
          <polygon
            points={`${CX - NEEDLE_LENGTH},${CY} ${CX + 14},${CY - 6} ${CX + 14},${CY + 6}`}
          />
        </g>
        <circle className="needle-hub" cx={CX} cy={CY} r="13" />
        <circle className="needle-pin" cx={CX} cy={CY} r="4.5" />
      </svg>

      {showReading && (
        <figcaption className="meter-reading">
          <strong style={{ color: zone.color }}>{percent}%</strong>
        </figcaption>
      )}
    </figure>
  )
}
