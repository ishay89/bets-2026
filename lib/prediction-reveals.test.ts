import { describe, it, expect } from 'vitest'
import { computePickDistribution, sortAndRankRevealRows } from './prediction-reveals'

const base = { isMonkey: false as const, automationStrategy: null, avatarEmoji: null, pick: '1', odds: null }

describe('sortAndRankRevealRows', () => {
  it('sorts by totalPoints descending and assigns 1-based rank', () => {
    const rows = [
      { ...base, userId: 'b', displayName: 'Bob', totalPoints: 10 },
      { ...base, userId: 'a', displayName: 'Alice', totalPoints: 30 },
      { ...base, userId: 'c', displayName: 'Carol', totalPoints: 20 },
    ]
    const result = sortAndRankRevealRows(rows)
    expect(result[0]).toMatchObject({ userId: 'a', rank: 1, totalPoints: 30 })
    expect(result[1]).toMatchObject({ userId: 'c', rank: 2, totalPoints: 20 })
    expect(result[2]).toMatchObject({ userId: 'b', rank: 3, totalPoints: 10 })
  })

  it('returns an empty array for empty input', () => {
    expect(sortAndRankRevealRows([])).toEqual([])
  })

  it('assigns rank 1 to the single entry', () => {
    const result = sortAndRankRevealRows([
      { ...base, userId: 'x', displayName: 'X', totalPoints: 5 },
    ])
    expect(result[0].rank).toBe(1)
  })

  it('does not mutate the input array', () => {
    const rows = [
      { ...base, userId: 'b', displayName: 'Bob', totalPoints: 5 },
      { ...base, userId: 'a', displayName: 'Alice', totalPoints: 15 },
    ]
    sortAndRankRevealRows(rows)
    expect(rows[0].userId).toBe('b')
  })

  it('assigns sequential ranks to tied totalPoints', () => {
    const rows = [
      { ...base, userId: 'a', displayName: 'Alice', totalPoints: 10 },
      { ...base, userId: 'b', displayName: 'Bob', totalPoints: 10 },
    ]
    const result = sortAndRankRevealRows(rows)
    expect(result[0].rank).toBe(1)
    expect(result[1].rank).toBe(2)
  })
})

describe('computePickDistribution', () => {
  it('groups rows by pick and counts occurrences', () => {
    const rows = [
      { ...base, userId: 'a', displayName: 'A', pick: '1', totalPoints: 0, rank: 1 },
      { ...base, userId: 'b', displayName: 'B', pick: '1', totalPoints: 0, rank: 2 },
      { ...base, userId: 'c', displayName: 'C', pick: 'X', totalPoints: 0, rank: 3 },
    ]
    const result = computePickDistribution(rows)
    expect(result).toEqual([
      { pick: '1', count: 2, pct: 67 },
      { pick: 'X', count: 1, pct: 33 },
    ])
  })

  it('sorts segments by count descending', () => {
    const rows = [
      { ...base, userId: 'a', displayName: 'A', pick: 'X', totalPoints: 0, rank: 1 },
      { ...base, userId: 'b', displayName: 'B', pick: '1', totalPoints: 0, rank: 2 },
      { ...base, userId: 'c', displayName: 'C', pick: '1', totalPoints: 0, rank: 3 },
      { ...base, userId: 'd', displayName: 'D', pick: '1', totalPoints: 0, rank: 4 },
    ]
    const result = computePickDistribution(rows)
    expect(result.map(s => s.pick)).toEqual(['1', 'X'])
    expect(result[0]).toEqual({ pick: '1', count: 3, pct: 75 })
  })

  it('returns an empty array for empty input', () => {
    expect(computePickDistribution([])).toEqual([])
  })

  it('returns a single 100% segment when every row has the same pick', () => {
    const rows = [
      { ...base, userId: 'a', displayName: 'A', pick: 'Brazil', totalPoints: 0, rank: 1 },
      { ...base, userId: 'b', displayName: 'B', pick: 'Brazil', totalPoints: 0, rank: 2 },
    ]
    expect(computePickDistribution(rows)).toEqual([{ pick: 'Brazil', count: 2, pct: 100 }])
  })
})
