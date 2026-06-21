import type { LeaderboardEntry } from './types'

export type LeaderboardScoreMode = 'total' | 'today'
export type LeaderboardSortMode = 'score' | 'successRate'

function pointsFor(entry: LeaderboardEntry, mode: LeaderboardScoreMode): number {
  return mode === 'today' ? entry.today_points : entry.total_points
}

function successRateFor(entry: LeaderboardEntry, mode: LeaderboardScoreMode): number | null {
  return mode === 'today' ? entry.today_success_rate : entry.total_success_rate
}

function compareNullableRateDesc(a: number | null, b: number | null): number {
  if (typeof a === 'number' && typeof b === 'number') return b - a
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return 0
}

export function sortLeaderboardEntries(
  entries: readonly LeaderboardEntry[],
  scoreMode: LeaderboardScoreMode,
  sortMode: LeaderboardSortMode,
): LeaderboardEntry[] {
  if (sortMode === 'score') {
    return scoreMode === 'today'
      ? entries.toSorted((a, b) => b.today_points - a.today_points)
      : [...entries]
  }

  return entries.toSorted((a, b) => {
    const rateDelta = compareNullableRateDesc(successRateFor(a, scoreMode), successRateFor(b, scoreMode))
    if (rateDelta !== 0) return rateDelta

    const scoreDelta = pointsFor(b, scoreMode) - pointsFor(a, scoreMode)
    if (scoreDelta !== 0) return scoreDelta

    return a.display_name.localeCompare(b.display_name)
  })
}

export function hasLeaderboardResults(
  entries: readonly LeaderboardEntry[],
  scoreMode: LeaderboardScoreMode,
): boolean {
  return entries.some(entry => (
    scoreMode === 'today'
      ? entry.today_scored_picks > 0 || entry.today_points > 0
      : entry.total_scored_picks > 0 || entry.total_points > 0
  ))
}
