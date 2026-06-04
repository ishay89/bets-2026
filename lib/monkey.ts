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

// Pikanteria now has the same 1/X/2 shape as a match; odds_x is null for a
// two-way question, in which case the X outcome is not available to pick.
type PikanteriaOdds = {
  odds_1: number
  odds_2: number
  odds_x: number | null
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

function monkeyMatchPick(matchId: string, date: string): Pick {
  const picks = ['1', 'X', '2'] as const
  return picks[Math.abs(hashCode(`${matchId}-${date}`)) % 3]
}

// The outcomes available on a pikanteria, in stable display order. X is only
// present when the question is three-way (odds_x is not null).
function pikanteriaOutcomes(odds: PikanteriaOdds): { pick: Pick; odds: number; order: number }[] {
  const outcomes: { pick: Pick; odds: number; order: number }[] = [
    { pick: '1', odds: odds.odds_1, order: 0 },
  ]
  if (odds.odds_x != null) outcomes.push({ pick: 'X', odds: odds.odds_x, order: 1 })
  outcomes.push({ pick: '2', odds: odds.odds_2, order: 2 })
  return outcomes
}

// Seeded random pick across the available outcomes (reproducible per day).
function monkeyPikanteriaPick(picanteriaId: string, date: string, odds: PikanteriaOdds): Pick {
  const outcomes = pikanteriaOutcomes(odds)
  return outcomes[Math.abs(hashCode(`${picanteriaId}-${date}`)) % outcomes.length].pick
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

export function automatedPikanteriaPick(odds: PikanteriaOdds, strategy: MarkerStrategy): Pick {
  const sorted = pikanteriaOutcomes(odds).sort((a, b) => b.odds - a.odds || a.order - b.order)

  if (strategy === 'max') return sorted[0].pick
  if (strategy === 'min') return sorted[sorted.length - 1].pick
  return sorted[Math.floor(sorted.length / 2)].pick
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
  pikas: (PikanteriaOdds & { id: string })[],
  date: string,
): { user_id: string; pikanteria_id: string; pick: Pick }[] {
  return users.flatMap(user =>
    pikas.map(pika => ({
      user_id: user.id,
      pikanteria_id: pika.id,
      pick: user.automation_strategy === 'monkey'
        ? monkeyPikanteriaPick(pika.id, date, pika)
        : automatedPikanteriaPick(pika, user.automation_strategy),
    }))
  )
}
