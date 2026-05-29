import { describe, it, expect } from 'vitest'
import { largestRemainder, toPct, matchInsight, type CrowdTally } from './crowd'

const tally = (h: number, d: number, a: number): CrowdTally => ({ '1': h, X: d, '2': a, total: h + d + a })
// Default odds where Away (2) is the clear underdog.
const ODDS = { '1': 1.8, X: 3.2, '2': 5.0 }

describe('largestRemainder', () => {
  it('returns all zeros when there are no votes', () => {
    expect(largestRemainder([0, 0, 0])).toEqual([0, 0, 0])
  })

  it('sums to exactly 100', () => {
    for (const vals of [[1, 1, 1], [2, 1, 0], [5, 3, 1], [7, 0, 0], [1, 2, 4]]) {
      expect(largestRemainder(vals).reduce((s, v) => s + v, 0)).toBe(100)
    }
  })

  it('rounds 1/1/1 to 34/33/33 (largest remainder favours the first)', () => {
    expect(largestRemainder([1, 1, 1])).toEqual([34, 33, 33])
  })

  it('handles a unanimous outcome', () => {
    expect(largestRemainder([4, 0, 0])).toEqual([100, 0, 0])
  })
})

describe('toPct', () => {
  it('maps a tally onto 1/X/2 percentages summing to 100', () => {
    const pct = toPct(tally(6, 2, 2))
    expect(pct['1'] + pct.X + pct['2']).toBe(100)
    expect(pct['1']).toBe(60)
  })

  it('is all zeros for an empty tally', () => {
    expect(toPct(tally(0, 0, 0))).toEqual({ '1': 0, X: 0, '2': 0 })
  })
})

describe('matchInsight', () => {
  it('returns null when nobody has picked', () => {
    expect(matchInsight({ tally: tally(0, 0, 0), odds: ODDS, myPick: null })).toBeNull()
  })

  it('celebrates being the only one backing the underdog', () => {
    // I picked Away (the 5.0 underdog) and I'm the only one on it.
    const out = matchInsight({ tally: tally(6, 1, 1), odds: ODDS, myPick: '2' })
    expect(out).toEqual({
      kind: 'underdog_hero', tone: 'accent', label: "You're the only one backing Away",
    })
  })

  it('flags a brave minority on the underdog', () => {
    // 2 of 12 backed the underdog (< 25%), and I'm one of them.
    const out = matchInsight({ tally: tally(8, 2, 2), odds: ODDS, myPick: '2' })
    expect(out).toEqual({
      kind: 'underdog_hero', tone: 'accent', label: 'Brave minority on Away',
    })
  })

  it('calls out a lone-wolf pick by someone else', () => {
    // One lonely Draw, and I am NOT on it.
    const out = matchInsight({ tally: tally(5, 1, 3), odds: ODDS, myPick: '1' })
    expect(out).toEqual({ kind: 'lone_wolf', tone: 'amber', label: 'Only 1 bet on Draw' })
  })

  it('does not fire lone-wolf on a three-way 1/1/1 split', () => {
    const out = matchInsight({ tally: tally(1, 1, 1), odds: ODDS, myPick: '1' })
    expect(out?.kind).not.toBe('lone_wolf')
  })

  it('reports consensus when the crowd piles on', () => {
    const out = matchInsight({ tally: tally(9, 1, 0), odds: ODDS, myPick: '1' })
    expect(out).toEqual({ kind: 'consensus', tone: 'neutral', label: '90% agree · Home' })
  })

  it('reports a dead split when nobody dominates', () => {
    const out = matchInsight({ tally: tally(2, 2, 2), odds: ODDS, myPick: '1' })
    expect(out).toEqual({ kind: 'split', tone: 'neutral', label: 'Dead split · nobody agrees' })
  })

  it('ignores the underdog when the highest odds are tied', () => {
    // No single underdog → falls through to consensus/other rules, not underdog_hero.
    const out = matchInsight({ tally: tally(1, 0, 0), odds: { '1': 2.0, X: 5.0, '2': 5.0 }, myPick: '2' })
    expect(out?.kind).not.toBe('underdog_hero')
  })
})
