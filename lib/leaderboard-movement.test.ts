import { describe, expect, it } from 'vitest'
import { formatRankDelta, formatTodayMovementPoints } from './leaderboard-movement'

describe('formatRankDelta', () => {
  it('formats positive rank movement with a plus sign', () => {
    expect(formatRankDelta(3)).toBe('+3')
  })

  it('formats negative rank movement', () => {
    expect(formatRankDelta(-2)).toBe('-2')
  })

  it('hides zero and missing rank movement', () => {
    expect(formatRankDelta(0)).toBeNull()
    expect(formatRankDelta(null)).toBeNull()
  })
})

describe('formatTodayMovementPoints', () => {
  it('formats positive latest-day points with a today suffix', () => {
    expect(formatTodayMovementPoints(8.5)).toBe('+8.50 today')
  })

  it('hides zero and missing latest-day points', () => {
    expect(formatTodayMovementPoints(0)).toBeNull()
    expect(formatTodayMovementPoints(null)).toBeNull()
  })
})
