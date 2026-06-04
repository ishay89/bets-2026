import { describe, it, expect } from 'vitest'
import {
  buildMatchScoringPayload,
  buildPikanteriaScoringPayload,
  buildTournamentScoringPayload,
  type ScoredMatchInput,
  type ScoredPikanteriaInput,
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
    const { matchResults } = buildMatchScoringPayload([match])
    expect(matchResults).toEqual([{ match_id: 'm1', result: '1' }])
  })

  it('scores correct picks with the result odds and wrong picks zero', () => {
    const { predictionPoints } = buildMatchScoringPayload([match])
    expect(predictionPoints).toEqual([
      { id: 'p-correct', points: 2.0 },
      { id: 'p-wrong', points: 0 },
    ])
  })

  it('uses the odds matching the actual result (plain odds, no multiplier)', () => {
    const awayWin: ScoredMatchInput = { ...match, result: '2', predictions: [{ id: 'p', pick: '2' }] }
    const { predictionPoints } = buildMatchScoringPayload([awayWin])
    expect(predictionPoints).toEqual([{ id: 'p', points: 4.0 }])
  })

  it('handles a match with no predictions', () => {
    const empty: ScoredMatchInput = { ...match, predictions: [] }
    const { matchResults, predictionPoints } = buildMatchScoringPayload([empty])
    expect(matchResults).toHaveLength(1)
    expect(predictionPoints).toEqual([])
  })
})

describe('buildPikanteriaScoringPayload', () => {
  const item: ScoredPikanteriaInput = {
    id: 'pk1',
    odds_1: 1.65,
    odds_2: 2.2,
    odds_x: 3.4,
    result: '1',
    answers: [
      { id: 'a-correct', pick: '1' },
      { id: 'a-wrong', pick: '2' },
    ],
  }

  it('emits the result write per question', () => {
    const { pikanteriaResults } = buildPikanteriaScoringPayload([item])
    expect(pikanteriaResults).toEqual([{ pikanteria_id: 'pk1', result: '1' }])
  })

  it('scores answers matching the winning outcome with its odds, others zero', () => {
    const { answerPoints } = buildPikanteriaScoringPayload([item])
    expect(answerPoints).toEqual([
      { id: 'a-correct', points: 1.65 },
      { id: 'a-wrong', points: 0 },
    ])
  })

  it('reads the X odds when the draw outcome wins', () => {
    const drawWin: ScoredPikanteriaInput = { ...item, result: 'X', answers: [{ id: 'a', pick: 'X' }] }
    const { answerPoints } = buildPikanteriaScoringPayload([drawWin])
    expect(answerPoints).toEqual([{ id: 'a', points: 3.4 }])
  })

  it('rejects an X result on a two-way question', () => {
    const invalidDrawWin: ScoredPikanteriaInput = {
      ...item,
      odds_x: null,
      result: 'X',
      answers: [{ id: 'a', pick: 'X' }],
    }

    expect(() => buildPikanteriaScoringPayload([invalidDrawWin]))
      .toThrow('Pikanteria pk1 cannot be resolved as X because it has no X odds')
  })
})

// Per-item scoring (one "Score this" button) passes a single-element payload to
// the same atomic RPC the day-wide path uses. These confirm the builders scope
// their output to exactly the one item handed in.
describe('per-item scoring payloads', () => {
  it('scores a single match without touching others', () => {
    const one: ScoredMatchInput = {
      id: 'm1', odds_home: 2, odds_draw: 3, odds_away: 4, result: '1',
      predictions: [{ id: 'p1', pick: '1' }],
    }
    const { matchResults, predictionPoints } = buildMatchScoringPayload([one])
    expect(matchResults).toEqual([{ match_id: 'm1', result: '1' }])
    expect(predictionPoints).toEqual([{ id: 'p1', points: 2 }])
  })

  it('scores a single pikanteria without touching others', () => {
    const one: ScoredPikanteriaInput = {
      id: 'pk1', odds_1: 2.0, odds_2: 1.5, odds_x: null, result: '1',
      answers: [{ id: 'a1', pick: '1' }],
    }
    const { pikanteriaResults, answerPoints } = buildPikanteriaScoringPayload([one])
    expect(pikanteriaResults).toEqual([{ pikanteria_id: 'pk1', result: '1' }])
    expect(answerPoints).toEqual([{ id: 'a1', points: 2.0 }])
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
