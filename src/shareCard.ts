import type { AnalyzeResponse } from '../worker/types.ts'
import { dialTicks, pointAt, zoneDegrees } from './gauge.ts'
import { drawHalftone } from './halftone.ts'
import { larpZone, ZONES, type Zone } from './zones.ts'

const WIDTH = 1080
const HEIGHT = 1350
const PAD = 80
const BG = '#0a0a0a'
const TEXT = '#ededed'
const MUTED = '#8b8b8b'
const LINE = '#262626'
const SANS = 'Inter, system-ui, sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, monospace'
const DIAL = { cx: 540, cy: 716, outer: 370, inner: 286, majorInner: 266, label: 404, needle: 290 }
const AVATAR_SIZE = 88
const AVATAR_TIMEOUT_MS = 4000
const ROAST_MAX_LINES = 3
const HALFTONE_TIME = 7.3

type Context = CanvasRenderingContext2D

// Waits for the site's fonts, so the card isn't drawn in a fallback font.
async function loadFonts() {
  await Promise.all([
    document.fonts.load(`600 200px ${SANS}`),
    document.fonts.load(`400 38px ${SANS}`),
    document.fonts.load(`400 26px ${MONO}`),
    document.fonts.load(`500 26px ${MONO}`),
  ])
}

// Loads the GitHub avatar for the card, or gives up quietly after a few seconds.
function loadAvatar(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const image = new Image()
    const timer = setTimeout(() => resolve(null), AVATAR_TIMEOUT_MS)
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      clearTimeout(timer)
      resolve(image)
    }
    image.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    const sized = new URL(url)
    sized.searchParams.set('s', String(AVATAR_SIZE * 2))
    image.src = sized.href
  })
}

// Splits a text into lines that fit a width, ending with … if it runs too long.
function wrapLines(context: Context, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = []
  let line = ''

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate
      continue
    }
    lines.push(line)
    line = word
  }
  lines.push(line)

  if (lines.length <= maxLines) {
    return lines
  }
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.includes(' ') && context.measureText(`${last}…`).width > maxWidth) {
    last = last.slice(0, last.lastIndexOf(' '))
  }
  kept[maxLines - 1] = `${last}…`
  return kept
}

// Paints the dark background with a halftone haze in the zone's color.
function drawBackground(context: Context, zone: Zone) {
  context.fillStyle = BG
  context.fillRect(0, 0, WIDTH, HEIGHT)
  drawHalftone(context, WIDTH, HEIGHT, HALFTONE_TIME, {
    color: `${zone.color}59`,
    step: 12,
    maxSize: 8,
  })

  const fade = context.createLinearGradient(0, 0, 0, HEIGHT)
  fade.addColorStop(0, `${BG}80`)
  fade.addColorStop(0.4, `${BG}33`)
  fade.addColorStop(0.72, `${BG}d9`)
  fade.addColorStop(1, `${BG}99`)
  context.fillStyle = fade
  context.fillRect(0, 0, WIDTH, HEIGHT)
}

// Writes the site's name and today's date across the top.
function drawHeader(context: Context) {
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  context.fillStyle = TEXT
  context.font = `600 44px ${SANS}`
  context.fillText('Sharp or Larp', PAD, PAD + 36)

  const date = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  context.textAlign = 'right'
  context.fillStyle = MUTED
  context.font = `400 26px ${MONO}`
  context.fillText(date.toUpperCase(), WIDTH - PAD, PAD + 34)
}

// Shows who was checked: their avatar and GitHub name, or that it was a CV.
function drawProfile(context: Context, login: string | null, avatar: HTMLImageElement | null) {
  const top = 176
  const textX = avatar ? PAD + AVATAR_SIZE + 28 : PAD

  if (avatar) {
    context.drawImage(avatar, PAD, top, AVATAR_SIZE, AVATAR_SIZE)
  }
  context.textAlign = 'left'
  context.fillStyle = login ? TEXT : MUTED
  context.font = `500 38px ${MONO}`
  context.fillText(login ? `@${login}` : 'Judged on a CV', textX, top + AVATAR_SIZE / 2 + 13)
}

// Draws the dial: ticks lit up to the score, zone names and the needle.
function drawDial(context: Context, percent: number) {
  const { cx, cy } = DIAL
  context.lineCap = 'butt'

  for (const tick of dialTicks()) {
    const outer = pointAt(cx, cy, DIAL.outer, tick.degrees)
    const inner = pointAt(cx, cy, tick.major ? DIAL.majorInner : DIAL.inner, tick.degrees)
    context.globalAlpha = tick.percent <= percent ? 1 : 0.22
    context.strokeStyle = larpZone(tick.percent).color
    context.lineWidth = tick.major ? 15 : 12
    context.beginPath()
    context.moveTo(inner.x, inner.y)
    context.lineTo(outer.x, outer.y)
    context.stroke()
  }

  const zone = larpZone(percent)
  context.font = `500 26px ${MONO}`
  context.textAlign = 'center'
  ZONES.forEach((current, index) => {
    const { from, to } = zoneDegrees(index)
    const middle = (from + to) / 2
    const point = pointAt(cx, cy, DIAL.label, middle)
    context.save()
    context.translate(point.x, point.y)
    context.rotate(((90 - middle) * Math.PI) / 180)
    context.fillStyle = current === zone ? current.color : TEXT
    context.fillText(current.name.toUpperCase(), 0, 0)
    context.restore()
  })
  context.globalAlpha = 1

  const degrees = 180 - percent * 1.8
  const tip = pointAt(cx, cy, DIAL.needle, degrees)
  const left = pointAt(cx, cy, 15, degrees + 90)
  const right = pointAt(cx, cy, 15, degrees - 90)
  context.fillStyle = TEXT
  context.beginPath()
  context.moveTo(tip.x, tip.y)
  context.lineTo(left.x, left.y)
  context.lineTo(right.x, right.y)
  context.closePath()
  context.fill()
  context.beginPath()
  context.arc(cx, cy, 32, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = BG
  context.beginPath()
  context.arc(cx, cy, 11, 0, Math.PI * 2)
  context.fill()
}

// Writes the score big under the dial, then "larp [ zone ]".
function drawReading(context: Context, percent: number) {
  const zone = larpZone(percent)
  context.textAlign = 'center'
  context.fillStyle = zone.color
  context.font = `600 200px ${SANS}`
  context.fillText(`${percent}%`, WIDTH / 2, DIAL.cy + 192)

  const word = 'larp  '
  const tag = `[ ${zone.name} ]`
  context.font = `500 34px ${MONO}`
  const start = WIDTH / 2 - context.measureText(word + tag).width / 2
  context.textAlign = 'left'
  context.fillStyle = MUTED
  context.fillText(word, start, DIAL.cy + 252)
  context.fillStyle = zone.color
  context.fillText(tag, start + context.measureText(word).width, DIAL.cy + 252)
}

// Writes the roast in quotes, on up to three centered lines.
function drawRoast(context: Context, roast: string) {
  context.font = `400 38px ${SANS}`
  context.fillStyle = TEXT
  context.textAlign = 'center'
  const lines = wrapLines(context, `“${roast}”`, WIDTH - PAD * 2, ROAST_MAX_LINES)
  lines.forEach((line, index) => {
    context.fillText(line, WIDTH / 2, DIAL.cy + 340 + index * 52)
  })
}

// Draws the bottom line: a rule, then where to check your own score.
function drawFooter(context: Context) {
  const y = HEIGHT - PAD + 6
  context.fillStyle = LINE
  context.fillRect(PAD, y - 58, WIDTH - PAD * 2, 2)

  context.font = `400 26px ${MONO}`
  context.textAlign = 'left'
  context.fillStyle = MUTED
  context.fillText('Check yours ->', PAD, y)
  context.font = `500 26px ${MONO}`
  context.textAlign = 'right'
  context.fillStyle = TEXT
  context.fillText('sharporlarp.com', WIDTH - PAD, y)
}

// Draws the shareable score card, Strava style, and returns it as a PNG.
export async function drawShareCard(result: AnalyzeResponse): Promise<Blob> {
  const [, avatar] = await Promise.all([loadFonts(), loadAvatar(result.avatarUrl)])
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas is not available')
  }

  const { larpPercent, roast } = result.verdict
  drawBackground(context, larpZone(larpPercent))
  drawHeader(context)
  drawProfile(context, result.login, avatar)
  drawDial(context, larpPercent)
  drawReading(context, larpPercent)
  drawRoast(context, roast)
  drawFooter(context)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/png')
  })
}
