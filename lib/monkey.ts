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

export function monkeyPikanteriaPick(picanteriaId: string, date: string): boolean {
  return Math.abs(hashCode(`${picanteriaId}-${date}`)) % 2 === 0
}
