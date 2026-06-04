import { describe, it, expect } from 'vitest'
import {
  calcMatchPoints,
  calcPicanteriaPoints,
  calcPreTournamentWinnerPoints,
  calcTopScorerPoints,
} from './scoring'

describe('calcMatchPoints', () => {
  it('returns 0 for wrong pick', () => {
    expect(calcMatchPoints(2.4, false)).toBe(0)
  })
  it('returns the plain result odds for a correct pick (no stage multiplier)', () => {
    expect(calcMatchPoints(2.4, true)).toBe(2.40)
  })
  it('rounds to 4 decimal places', () => {
    expect(calcMatchPoints(1.00015, true)).toBe(1.0002)
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
