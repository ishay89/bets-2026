export function formatRankDelta(delta: number | null | undefined): string | null {
  if (!delta) return null
  return delta > 0 ? `+${delta}` : String(delta)
}

export function formatTodayMovementPoints(
  points: number | null | undefined,
  label = 'today',
): string | null {
  if (!points || points <= 0) return null
  return `+${points.toFixed(2)} ${label}`
}
