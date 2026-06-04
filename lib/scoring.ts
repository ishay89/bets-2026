function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// Ongoing bets (matches + pikanteria) score the plain result odds — no stage
// multiplier. Any weighting an admin wants is baked into the odds when they are
// set, so the leaderboard is a straight sum. The futures bonuses below keep
// their multipliers: those are applied once, at tournament close.
export function calcMatchPoints(odds: number, isCorrect: boolean): number {
  if (!isCorrect) return 0
  return round4(odds)
}

export function calcPicanteriaPoints(odds: number, isCorrect: boolean): number {
  if (!isCorrect) return 0
  return round4(odds)
}

export function calcPreTournamentWinnerPoints(
  odds: number,
  placement: 'winner' | 'runner-up' | 'other'
): number {
  if (placement === 'winner') return round4(odds * 1.5)
  if (placement === 'runner-up') return round4(odds * 0.75)
  return 0
}

export function calcTopScorerPoints(odds: number, isCorrect: boolean): number {
  if (!isCorrect) return 0
  return round4(odds)
}
