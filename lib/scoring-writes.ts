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
import type { Pick } from './types'

/** {id, points} row, matching the RPC's jsonb_to_recordset shape. */
export interface PointsWrite {
  id: string
  points: number
}

export interface MatchResultWrite {
  match_id: string
  result: Pick
}

export interface PikanteriaResultWrite {
  pikanteria_id: string
  result: Pick
}

export interface ScoredMatchInput {
  id: string
  odds_home: number
  odds_draw: number
  odds_away: number
  result: Pick
  predictions: { id: string; pick: Pick }[]
}

// Pikanteria scores exactly like a match now: pick the odds for the winning
// outcome (odds_x is null for two-way questions and only read when result is X).
export interface ScoredPikanteriaInput {
  id: string
  odds_1: number
  odds_2: number
  odds_x: number | null
  result: Pick
  answers: { id: string; pick: Pick }[]
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
        points: calcMatchPoints(oddsForResult, pred.pick === match.result),
      })
    }
  }

  return { matchResults, predictionPoints }
}

/** Build the result + answer-point writes for the day's pikanteria. */
export function buildPikanteriaScoringPayload(
  items: ScoredPikanteriaInput[],
): { pikanteriaResults: PikanteriaResultWrite[]; answerPoints: PointsWrite[] } {
  const pikanteriaResults: PikanteriaResultWrite[] = []
  const answerPoints: PointsWrite[] = []

  for (const item of items) {
    pikanteriaResults.push({ pikanteria_id: item.id, result: item.result })

    const oddsForResult = pikanteriaOddsForResult(item)

    for (const ans of item.answers) {
      answerPoints.push({
        id: ans.id,
        points: calcPicanteriaPoints(oddsForResult, ans.pick === item.result),
      })
    }
  }

  return { pikanteriaResults, answerPoints }
}

function pikanteriaOddsForResult(item: ScoredPikanteriaInput): number {
  if (item.result === '1') return item.odds_1
  if (item.result === '2') return item.odds_2
  if (item.odds_x == null) {
    throw new Error(`Pikanteria ${item.id} cannot be resolved as X because it has no X odds`)
  }
  return item.odds_x
}

/**
 * Where a player's champion pick landed once the final results are in.
 * `champion` = picked the winner, `runner-up` = picked the beaten finalist,
 * `missed` = neither. Shared by the point builder and the per-player settlement
 * badge so the two can never disagree about placement.
 */
export type WinnerOutcome = 'champion' | 'runner-up' | 'missed'

export function settleWinnerPick(
  pickTeam: string,
  finalWinner: string,
  finalRunnerUp: string,
): WinnerOutcome {
  if (pickTeam === finalWinner) return 'champion'
  if (pickTeam === finalRunnerUp) return 'runner-up'
  return 'missed'
}

/** True when the player's top-scorer pick matches the tournament top scorer. */
export function settleTopScorerPick(pickScorer: string, finalTopScorer: string): boolean {
  return pickScorer === finalTopScorer
}

const WINNER_PLACEMENT: Record<WinnerOutcome, 'winner' | 'runner-up' | 'other'> = {
  champion: 'winner',
  'runner-up': 'runner-up',
  missed: 'other',
}

/** Build the per-pick bonus-point writes from the final tournament results. */
export function buildTournamentScoringPayload(
  picks: PreTournamentPickInput[],
  winner: string,
  runnerUp: string,
  topScorer: string,
): PreTournamentPointsWrite[] {
  return picks.map(pick => {
    const placement = WINNER_PLACEMENT[settleWinnerPick(pick.winner_team, winner, runnerUp)]

    return {
      id: pick.id,
      winner_points: calcPreTournamentWinnerPoints(pick.winner_odds, placement),
      top_scorer_points: calcTopScorerPoints(pick.top_scorer_odds, settleTopScorerPick(pick.top_scorer, topScorer)),
    }
  })
}
