import { ZONES } from './zones.ts'

export type Tick = {
  percent: number
  degrees: number
  major: boolean
}

export const TICK_EVERY_PERCENT = 2.5
export const MAJOR_TICK_EVERY_PERCENT = 10

// Turns a larp percentage into its angle on the dial: 0% far left, 100% far right.
export function percentToDegrees(percent: number): number {
  return 180 - percent * 1.8
}

// Gives the point at this radius and angle around a center (180° is far left).
export function pointAt(cx: number, cy: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180
  return { x: cx + radius * Math.cos(radians), y: cy - radius * Math.sin(radians) }
}

// Lists the dial's ticks, one every 2.5%, with a longer one every 10%.
export function dialTicks(): Tick[] {
  return Array.from({ length: 100 / TICK_EVERY_PERCENT + 1 }, (_, index) => {
    const percent = index * TICK_EVERY_PERCENT
    return {
      percent,
      degrees: percentToDegrees(percent),
      major: percent % MAJOR_TICK_EVERY_PERCENT === 0,
    }
  })
}

// Gives the angles a zone spans on the dial, from its left edge to its right edge.
export function zoneDegrees(index: number) {
  const width = 100 / ZONES.length
  return { from: percentToDegrees(index * width), to: percentToDegrees((index + 1) * width) }
}
