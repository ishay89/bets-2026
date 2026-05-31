import type { AutomationStrategy, Pick } from './types'

export type { AutomationStrategy } from './types'

export const AUTOMATED_MARKER_USERS: {
  id: string
  email: string
  display_name: string
  strategy: Exclude<AutomationStrategy, 'monkey'>
}[] = [
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'always-max@mondial2026.local',
    display_name: 'Always Max',
    strategy: 'max',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'always-mid@mondial2026.local',
    display_name: 'Always Mid',
    strategy: 'mid',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'always-min@mondial2026.local',
    display_name: 'Always Min',
    strategy: 'min',
  },
]

type MarkerStrategy = Exclude<AutomationStrategy, 'monkey'>

type MatchOdds = {
  odds_home: number
  odds_draw: number
  odds_away: number
}

type OptionOdds = {
  id: string
  odds: number
  sort_order?: number
}

// Seeded hash so monkey picks are reproducible per match per day
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export function monkeyMatchPick(matchId: string, date: string): Pick {
  const picks = ['1', 'X', '2'] as const
  return picks[Math.abs(hashCode(`${matchId}-${date}`)) % 3]
}

// Returns the id of a randomly chosen option (seeded, reproducible).
// optionIds must be non-empty; caller is responsible for ensuring this.
export function monkeyPikanteriaPick(picanteriaId: string, date: string, optionIds: string[]): string {
  return optionIds[Math.abs(hashCode(`${picanteriaId}-${date}`)) % optionIds.length]
}

export function automatedMatchPick(match: MatchOdds, strategy: MarkerStrategy): Pick {
  const picks = [
    { pick: '1' as const, odds: match.odds_home, order: 0 },
    { pick: 'X' as const, odds: match.odds_draw, order: 1 },
    { pick: '2' as const, odds: match.odds_away, order: 2 },
  ].sort((a, b) => b.odds - a.odds || a.order - b.order)

  if (strategy === 'max') return picks[0].pick
  if (strategy === 'min') return picks[picks.length - 1].pick
  return picks[Math.floor(picks.length / 2)].pick
}

export function automatedPikanteriaPick(options: OptionOdds[], strategy: MarkerStrategy): string {
  if (options.length === 0) {
    throw new Error('automatedPikanteriaPick requires at least one option')
  }

  const sorted = [...options].sort((a, b) =>
    b.odds - a.odds || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id)
  )

  if (strategy === 'max') return sorted[0].id
  if (strategy === 'min') return sorted[sorted.length - 1].id
  return sorted[Math.floor(sorted.length / 2)].id
}

export type AutomatedUser = { id: string; automation_strategy: AutomationStrategy }

// Build the automated benchmark prediction rows for a set of matches — one row
// per automated user per match. Used when publishing individual matches.
export function buildAutomatedMatchRows(
  users: AutomatedUser[],
  matches: (MatchOdds & { id: string })[],
  date: string,
): { user_id: string; match_id: string; pick: Pick }[] {
  return users.flatMap(user =>
    matches.map(match => ({
      user_id: user.id,
      match_id: match.id,
      pick: user.automation_strategy === 'monkey'
        ? monkeyMatchPick(match.id, date)
        : automatedMatchPick(match, user.automation_strategy),
    }))
  )
}

// Build the automated benchmark answer rows for a set of pikanteria — one row
// per automated user per question. Used when publishing individual pikanteria.
export function buildAutomatedPikaRows(
  users: AutomatedUser[],
  pikas: { id: string; options: OptionOdds[] }[],
  date: string,
): { user_id: string; pikanteria_id: string; option_id: string }[] {
  return users.flatMap(user =>
    pikas.map(pika => ({
      user_id: user.id,
      pikanteria_id: pika.id,
      option_id: user.automation_strategy === 'monkey'
        ? monkeyPikanteriaPick(pika.id, date, pika.options.map(o => o.id))
        : automatedPikanteriaPick(pika.options, user.automation_strategy),
    }))
  )
}
