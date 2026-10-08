export type Zone = {
  name: string
  color: string
  text: string
  ink: string
}

export const ZONES: Zone[] = [
  { name: 'Low', color: '#4f9d5d', text: '#f4f1ea', ink: '#6fae7a' },
  { name: 'Moderate', color: '#d8b64a', text: '#3b2f00', ink: '#d8b64a' },
  { name: 'High', color: '#d98a3a', text: '#3d2200', ink: '#d98a3a' },
  { name: 'Extreme', color: '#c9483c', text: '#f4f1ea', ink: '#e0705f' },
  { name: 'LARP god', color: '#7e1f2e', text: '#f4f1ea', ink: '#e2566c' },
]

// Gives the zone a larp percentage falls in, one zone every 20 points.
export function larpZone(percent: number): Zone {
  return ZONES[Math.min(ZONES.length - 1, Math.floor(percent / 20))]
}
