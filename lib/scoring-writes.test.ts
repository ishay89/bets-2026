import { describe, it, expect } from 'vitest'
import {
  buildMatchScoringPayload,
  buildPikanteriaScoringPayload,
  buildTournamentScoringPayload,
  type ScoredMatchInput,
  type PikanteriaInput,
  type PreTournamentPickInput,
} from './scoring-writes'

describe('buildMatchScoringPayload', () => {
  const match: ScoredMatchInput = {
    id: 'm1',
    odds_home: 2.0,
    odds_draw: 3.0,
    odds_away: 4.0,
    result: '1',
    predictions: [
      { id: 'p-correct', pick: '1' },
      { id: 'p-wrong', pick: '2' },
    ],
  }

  it('emits one match-result write per match', () => {
    const { matchResults } = buildMatchScoringPayload([match], 'group')
    expect(matchResults).toEqual([{ match_id: 'm1', result: '1' }])
  })

  it('scores correct picks with the result odds and wrong picks zero', () => {
    const { predictionPoints } = buildMatchScoringPayload([match], 'group')
    expect(predictionPoints).toEqual([
      { id: 'p-correct', points: 2.0 },
      { id: 'p-wrong', points: 0 },
    ])
  })

  it('uses the odds matching the actual result and applies the stage multiplier', () => {
    const awayWin: ScoredMatchInput = { ...match, result: '2', predictions: [{ id: 'p', pick: '2' }] }
    // away odds 4.0 × qf multiplier 1.5 = 6.0
    const { predictionPoints } = buildMatchScoringPayload([awayWin], 'qf')
    expect(predictionPoints).toEqual([{ id: 'p', points: 6.0 }])
  })

  it('handles a match with no predictions', () => {
    const empty: ScoredMatchInput = { ...match, predictions: [] }
    const { matchResults, predictionPoints } = buildMatchScoringPayload([empty], 'group')
    expect(matchResults).toHaveLength(1)
    expect(predictionPoints).toEqual([])
  })
})

describe('buildPikanteriaScoringPayload', () => {
  const item: PikanteriaInput = {
    id: 'pk1',
    winningOptionId: 'opt-win',
    winningOdds: 1.65,
    answers: [
      { id: 'a-correct', option_id: 'opt-win' },
      { id: 'a-wrong', option_id: 'opt-lose' },
    ],
  }

  it('emits the winner flip per question', () => {
    const { winners } = buildPikanteriaScoringPayload([item])
    expect(winners).toEqual([{ pikanteria_id: 'pk1', option_id: 'opt-win' }])
  })

  it('scores answers matching the winning option with its odds, others zero', () => {
    const { answerPoints } = buildPikanteriaScoringPayload([item])
    expect(answerPoints).toEqual([
      { id: 'a-correct', points: 1.65 },
      { id: 'a-wrong', points: 0 },
    ])
  })
})

describe('buildTournamentScoringPayload', () => {
  const picks: PreTournamentPickInput[] = [
    { id: 'w', winner_team: 'Brazil', winner_odds: 4.5, top_scorer: 'Vini', top_scorer_odds: 7.0 },
    { id: 'r', winner_team: 'France', winner_odds: 5.0, top_scorer: 'Mbappe', top_scorer_odds: 6.0 },
    { id: 'o', winner_team: 'Spain', winner_odds: 6.0, top_scorer: 'Yamal', top_scorer_odds: 9.0 },
  ]

  it('awards winner, runner-up, and zero by placement, plus top-scorer points', () => {
    const result = buildTournamentScoringPayload(picks, 'Brazil', 'France', 'Mbappe')
    expect(result).toEqual([
      { id: 'w', winner_points: 6.75, top_scorer_points: 0 },     // 4.5 × 1.5, wrong scorer
      { id: 'r', winner_points: 3.75, top_scorer_points: 6.0 },   // 5.0 × 0.75, correct scorer
      { id: 'o', winner_points: 0, top_scorer_points: 0 },        // other, wrong scorer
    ])
  })

  it('returns an empty array when there are no picks', () => {
    expect(buildTournamentScoringPayload([], 'Brazil', 'France', 'Mbappe')).toEqual([])
  })
})
