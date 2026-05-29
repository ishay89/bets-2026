// Pure builders that turn raw rows + the entered results into the payloads
// consumed by the atomic scoring RPCs (see supabase/migrations/010_atomic_scoring.sql).
//
// All point math is delegated to lib/scoring.ts. Keeping these functions pure
// (no I/O) makes the scoring write path unit-testable without a database.

import {
  calcMatchPoints,
  calcPicanteriaPoints,
  calcPreTournamentWinnerPoints,
  calcTopScorerPoints,
} from './scoring'
import type { Stage, Pick } from './types'

/** {id, points} row, matching the RPC's jsonb_to_recordset shape. */
export interface PointsWrite {
  id: string
  points: number
}

export interface MatchResultWrite {
  match_id: string
  result: Pick
}

export interface PikanteriaWinnerWrite {
  pikanteria_id: string
  option_id: string
}

export interface ScoredMatchInput {
  id: string
  odds_home: number
  odds_draw: number
  odds_away: number
  result: Pick
  predictions: { id: string; pick: Pick }[]
}

export interface PikanteriaInput {
  id: string
  winningOptionId: string
  winningOdds: number
  answers: { id: string; option_id: string }[]
}

export interface PreTournamentPickInput {
  id: string
  winner_team: string
  winner_odds: number
  top_scorer: string
  top_scorer_odds: number
}

export interface PreTournamentPointsWrite {
  id: string
  winner_points: number
  top_scorer_points: number
}

/** Build the match-result + prediction-point writes for one match day. */
export function buildMatchScoringPayload(
  matches: ScoredMatchInput[],
  stage: Stage,
): { matchResults: MatchResultWrite[]; predictionPoints: PointsWrite[] } {
  const matchResults: MatchResultWrite[] = []
  const predictionPoints: PointsWrite[] = []

  for (const match of matches) {
    matchResults.push({ match_id: match.id, result: match.result })

    const oddsForResult =
      match.result === '1' ? match.odds_home
      : match.result === 'X' ? match.odds_draw
      : match.odds_away

    for (const pred of match.predictions) {
      predictionPoints.push({
        id: pred.id,
        points: calcMatchPoints(oddsForResult, stage, pred.pick === match.result),
      })
    }
  }

  return { matchResults, predictionPoints }
}

/** Build the winner flips + answer-point writes for the day's pikanteria. */
export function buildPikanteriaScoringPayload(
  items: PikanteriaInput[],
): { winners: PikanteriaWinnerWrite[]; answerPoints: PointsWrite[] } {
  const winners: PikanteriaWinnerWrite[] = []
  const answerPoints: PointsWrite[] = []

  for (const item of items) {
    winners.push({ pikanteria_id: item.id, option_id: item.winningOptionId })

    for (const ans of item.answers) {
      answerPoints.push({
        id: ans.id,
        points: calcPicanteriaPoints(item.winningOdds, ans.option_id === item.winningOptionId),
      })
    }
  }

  return { winners, answerPoints }
}

/** Build the per-pick bonus-point writes from the final tournament results. */
export function buildTournamentScoringPayload(
  picks: PreTournamentPickInput[],
  winner: string,
  runnerUp: string,
  topScorer: string,
): PreTournamentPointsWrite[] {
  return picks.map(pick => {
    let placement: 'winner' | 'runner-up' | 'other' = 'other'
    if (pick.winner_team === winner) placement = 'winner'
    else if (pick.winner_team === runnerUp) placement = 'runner-up'

    return {
      id: pick.id,
      winner_points: calcPreTournamentWinnerPoints(pick.winner_odds, placement),
      top_scorer_points: calcTopScorerPoints(pick.top_scorer_odds, pick.top_scorer === topScorer),
    }
  })
}
