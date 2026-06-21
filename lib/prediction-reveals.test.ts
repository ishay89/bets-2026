import { describe, it, expect } from 'vitest'
import { appendMissingPlayers, computePickDistribution, sortAndRankRevealRows } from './prediction-reveals'

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

  it('keeps players who did not bet (pick null) in their points-ranked position', () => {
    const rows = [
      { ...base, userId: 'a', displayName: 'Alice', pick: null, totalPoints: 100 },
      { ...base, userId: 'b', displayName: 'Bob', pick: '1', totalPoints: 5 },
      { ...base, userId: 'c', displayName: 'Carol', pick: 'X', totalPoints: 50 },
    ]
    const result = sortAndRankRevealRows(rows)
    // Non-bettors are sorted by points just like everyone else, not pushed down.
    expect(result.map(r => r.userId)).toEqual(['a', 'c', 'b'])
    expect(result[0]).toMatchObject({ userId: 'a', pick: null, rank: 1 })
  })
})

describe('appendMissingPlayers', () => {
  const players = [
    { id: 'a', display_name: 'Alice', is_monkey: false, automation_strategy: null, avatar_emoji: null },
    { id: 'b', display_name: 'Bob', is_monkey: false, automation_strategy: null, avatar_emoji: null },
    { id: 'c', display_name: 'Carol', is_monkey: false, automation_strategy: null, avatar_emoji: null },
  ]

  it('adds a null-pick row for every approved player without a pick', () => {
    const picked = [{ ...base, userId: 'a', displayName: 'Alice', totalPoints: 30 }]
    const result = appendMissingPlayers(picked, players, { a: 30, b: 10, c: 20 })
    expect(result).toHaveLength(3)
    const missing = result.filter(r => r.pick === null)
    expect(missing.map(r => r.userId).sort()).toEqual(['b', 'c'])
    expect(missing.find(r => r.userId === 'b')).toMatchObject({ pick: null, odds: null, totalPoints: 10 })
  })

  it('leaves picked rows untouched when everyone bet', () => {
    const picked = [
      { ...base, userId: 'a', displayName: 'Alice', totalPoints: 0 },
      { ...base, userId: 'b', displayName: 'Bob', totalPoints: 0 },
      { ...base, userId: 'c', displayName: 'Carol', totalPoints: 0 },
    ]
    const result = appendMissingPlayers(picked, players, {})
    expect(result).toHaveLength(3)
    expect(result.every(r => r.pick !== null)).toBe(true)
  })

  it('defaults missing points to 0 when absent from the points map', () => {
    const result = appendMissingPlayers([], players, {})
    expect(result.every(r => r.pick === null && r.totalPoints === 0)).toBe(true)
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

  it('excludes non-bettors (null pick) from the distribution and its percentages', () => {
    const rows = [
      { ...base, userId: 'a', displayName: 'A', pick: '1', totalPoints: 0, rank: 1 },
      { ...base, userId: 'b', displayName: 'B', pick: 'X', totalPoints: 0, rank: 2 },
      { ...base, userId: 'c', displayName: 'C', pick: null, totalPoints: 0, rank: 3 },
      { ...base, userId: 'd', displayName: 'D', pick: null, totalPoints: 0, rank: 4 },
    ]
    // Percentages are over the 2 actual bettors, not all 4 rows.
    expect(computePickDistribution(rows)).toEqual([
      { pick: '1', count: 1, pct: 50 },
      { pick: 'X', count: 1, pct: 50 },
    ])
  })

  it('returns an empty array when nobody bet', () => {
    const rows = [
      { ...base, userId: 'a', displayName: 'A', pick: null, totalPoints: 0, rank: 1 },
      { ...base, userId: 'b', displayName: 'B', pick: null, totalPoints: 0, rank: 2 },
    ]
    expect(computePickDistribution(rows)).toEqual([])
  })
})
