import { describe, it, expect } from 'vitest'
import { sortAndRankRevealRows } from './prediction-reveals'

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
