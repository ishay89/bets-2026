// Seeded hash so monkey picks are reproducible per match per day
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export function monkeyMatchPick(matchId: string, date: string): '1' | 'X' | '2' {
  const picks = ['1', 'X', '2'] as const
  return picks[Math.abs(hashCode(`${matchId}-${date}`)) % 3]
}

// Returns the id of a randomly chosen option (seeded, reproducible).
// optionIds must be non-empty; caller is responsible for ensuring this.
export function monkeyPikanteriaPick(picanteriaId: string, date: string, optionIds: string[]): string {
  return optionIds[Math.abs(hashCode(`${picanteriaId}-${date}`)) % optionIds.length]
}
