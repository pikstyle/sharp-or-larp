export type Zone = {
  name: string
  color: string
}

export const ZONES: Zone[] = [
  { name: 'Sharp', color: '#3ddc84' },
  { name: 'Low', color: '#b5e550' },
  { name: 'Moderate', color: '#f5c542' },
  { name: 'High', color: '#ff8a3d' },
  { name: 'LARP god', color: '#ff3d5a' },
]

// Gives the zone a larp percentage falls in, one zone every 20 points.
export function larpZone(percent: number): Zone {
  return ZONES[Math.min(ZONES.length - 1, Math.floor(percent / 20))]
}
