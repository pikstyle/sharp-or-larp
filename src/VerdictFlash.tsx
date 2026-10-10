import { useEffect, useRef } from 'react'

const STEP = 9
const MAX_SIZE = 3.2
const DURATION_MS = 850
const RING_WIDTH = 160
const PEAK_ALPHA = 0.45

type Props = {
  color: string
}

// Draws one frame: a ring of squares spreading from the meter, fading as it goes.
function drawRing(context: CanvasRenderingContext2D, origin: DOMPoint, progress: number) {
  const { width, height } = context.canvas
  const reach = Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y))
  const radius = progress * reach

  context.clearRect(0, 0, width, height)
  context.globalAlpha = PEAK_ALPHA * (1 - progress)
  context.beginPath()
  for (let y = STEP / 2; y < height; y += STEP) {
    for (let x = STEP / 2; x < width; x += STEP) {
      const closeness = 1 - Math.abs(Math.hypot(x - origin.x, y - origin.y) - radius) / RING_WIDTH
      if (closeness > 0) {
        const size = MAX_SIZE * closeness
        context.rect(x - size / 2, y - size / 2, size, size)
      }
    }
  }
  context.fill()
}

// A quick flash of colored dots behind the page when a verdict lands.
export default function VerdictFlash({ color }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    element.width = window.innerWidth
    element.height = window.innerHeight
    context.fillStyle = color
    const meter = document.querySelector('.meter')?.getBoundingClientRect()
    const origin = new DOMPoint(
      meter ? meter.left + meter.width / 2 : element.width / 2,
      meter ? meter.top + meter.height * 0.8 : element.height / 2,
    )
    const start = performance.now()
    let frame = 0

    // Moves the ring outward until the flash is over, then wipes the canvas.
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / DURATION_MS)
      drawRing(context!, origin, progress)
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        context!.clearRect(0, 0, element!.width, element!.height)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [color])

  return <canvas ref={canvas} className="verdict-flash" aria-hidden="true" />
}
