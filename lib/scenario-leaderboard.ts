import {
  calcPreTournamentWinnerPoints,
  calcTopScorerPoints,
} from './scoring'
import type { LeaderboardEntry } from './types'

export interface ScenarioFuturesPick {
  user_id: string
  winner_team: string
  winner_odds: number
  top_scorer: string
  top_scorer_odds: number
  winner_points: number | null
  top_scorer_points: number | null
}

export interface TournamentScenario {
  winner: string
  runnerUp: string
  topScorer: string
}

export interface ScenarioLeaderboardRow {
  id: string
  displayName: string
  currentRank: number
  projectedRank: number
  rankChange: number
  currentPoints: number
  projectedPoints: number
  projectedBonus: number
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * Projects the final table without mutating any stored result.
 *
 * Existing futures points are removed first so the simulator also stays
 * correct if it is opened after tournament bonuses have already been scored.
 */
export function buildScenarioLeaderboard(
  entries: readonly LeaderboardEntry[],
  picks: readonly ScenarioFuturesPick[],
  scenario: TournamentScenario,
): ScenarioLeaderboardRow[] {
  const picksByUser = new Map(picks.map(pick => [pick.user_id, pick]))

  const projected = entries.map((entry, index) => {
    const pick = picksByUser.get(entry.id)
    const currentFuturesPoints = (pick?.winner_points ?? 0) + (pick?.top_scorer_points ?? 0)
    const basePoints = entry.total_points - currentFuturesPoints

    let placement: 'winner' | 'runner-up' | 'other' = 'other'
    if (pick?.winner_team === scenario.winner) placement = 'winner'
    else if (pick?.winner_team === scenario.runnerUp) placement = 'runner-up'

    const winnerBonus = pick
      ? calcPreTournamentWinnerPoints(pick.winner_odds, placement)
      : 0
    const scorerBonus = pick
      ? calcTopScorerPoints(pick.top_scorer_odds, pick.top_scorer === scenario.topScorer)
      : 0
    const projectedBonus = round4(winnerBonus + scorerBonus)

    return {
      id: entry.id,
      displayName: entry.display_name,
      currentRank: entry.current_rank ?? index + 1,
      projectedRank: 0,
      rankChange: 0,
      currentPoints: entry.total_points,
      projectedPoints: round4(basePoints + projectedBonus),
      projectedBonus,
    }
  }).toSorted((a, b) => (
    b.projectedPoints - a.projectedPoints
    || a.displayName.localeCompare(b.displayName)
  ))

  let lastPoints: number | null = null
  let lastRank = 0
  return projected.map((row, index) => {
    if (lastPoints === null || row.projectedPoints !== lastPoints) {
      lastRank = index + 1
      lastPoints = row.projectedPoints
    }
    return {
      ...row,
      projectedRank: lastRank,
      rankChange: row.currentRank - lastRank,
    }
  })
}
