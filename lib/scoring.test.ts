import { describe, it, expect } from 'vitest'
import {
  calcMatchPoints,
  calcPicanteriaPoints,
  calcPreTournamentWinnerPoints,
  calcTopScorerPoints,
  STAGE_MULTIPLIERS,
} from './scoring'

describe('calcMatchPoints', () => {
  it('returns 0 for wrong pick', () => {
    expect(calcMatchPoints(2.4, 'group', false)).toBe(0)
  })
  it('group stage: odds × 1', () => {
    expect(calcMatchPoints(2.4, 'group', true)).toBe(2.40)
  })
  it('quarter-final: odds × 1.5', () => {
    expect(calcMatchPoints(2.4, 'qf', true)).toBe(3.60)
  })
  it('semi-final: odds × 2', () => {
    expect(calcMatchPoints(2.4, 'sf', true)).toBe(4.80)
  })
  it('final: odds × 3', () => {
    expect(calcMatchPoints(2.4, 'final', true)).toBe(7.20)
  })
  it('rounds to 2 decimal places', () => {
    expect(calcMatchPoints(1.85, 'sf', true)).toBe(3.70)
  })
})

describe('calcPicanteriaPoints', () => {
  it('returns 0 for wrong answer', () => {
    expect(calcPicanteriaPoints(1.65, false)).toBe(0)
  })
  it('returns exact odds for correct answer', () => {
    expect(calcPicanteriaPoints(1.65, true)).toBe(1.65)
  })
})

describe('calcPreTournamentWinnerPoints', () => {
  it('winner: odds × 1.5', () => {
    expect(calcPreTournamentWinnerPoints(4.5, 'winner')).toBe(6.75)
  })
  it('runner-up: odds × 0.75', () => {
    expect(calcPreTournamentWinnerPoints(4.5, 'runner-up')).toBe(3.375)
  })
  it('other: 0', () => {
    expect(calcPreTournamentWinnerPoints(4.5, 'other')).toBe(0)
  })
})

describe('calcTopScorerPoints', () => {
  it('returns 0 for wrong pick', () => {
    expect(calcTopScorerPoints(7.0, false)).toBe(0)
  })
  it('returns exact odds for correct pick', () => {
    expect(calcTopScorerPoints(7.0, true)).toBe(7.0)
  })
})
