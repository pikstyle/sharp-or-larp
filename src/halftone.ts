export type HalftoneStyle = {
  color: string
  step: number
  maxSize: number
}

// Gives a smooth 0 to 1 value that drifts with time, like slow smoke.
function smoke(x: number, y: number, time: number): number {
  const warp = Math.sin(y * 0.011 + time * 0.7) * 1.8
  const a = Math.sin(x * 0.009 + warp + time * 0.4)
  const b = Math.cos(y * 0.01 - Math.sin(x * 0.007 - time * 0.5) * 1.6 - time * 0.3)
  return (a * b + 1) / 2
}

// Draws halftone squares over an area: big where the smoke is thick, none elsewhere.
export function drawHalftone(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  style: HalftoneStyle,
) {
  context.fillStyle = style.color
  context.beginPath()
  for (let y = style.step / 2; y < height; y += style.step) {
    for (let x = style.step / 2; x < width; x += style.step) {
      const thickness = Math.max(0, smoke(x, y, time) - 0.38) / 0.62
      const size = style.maxSize * thickness * thickness
      if (size > 0.4) {
        context.rect(x - size / 2, y - size / 2, size, size)
      }
    }
  }
  context.fill()
}
