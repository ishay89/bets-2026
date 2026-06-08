import { describe, expect, it } from 'vitest'
import { computeUserMissingCounts } from './missing-picks'

const day = (overrides: Partial<{
  id: string
  matches: { id: string; kickoff_time: string; locked: boolean | null; published_at: string | null }[]
  pikanteria: { id: string; locked: boolean; published_at: string | null }[]
}> = {}) => ({
  id: overrides.id ?? 'day-1',
  date: '2026-06-10',
  stage: 'group' as const,
  matches: overrides.matches ?? [],
  pikanteria: overrides.pikanteria ?? [],
})

const FUTURE_KICKOFF = '2999-01-01T12:00:00Z'
const PAST_KICKOFF = '2000-01-01T12:00:00Z'

describe('computeUserMissingCounts', () => {
  it('returns zero missing when there are no open items and futures is not open', () => {
    const result = computeUserMissingCounts({
      matchDays: [],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 0, submitted: 0, missing: 0 })
  })

  it('counts an open match with no prediction as missing', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({ matches: [
        { id: 'm1', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
      ] })],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 1, submitted: 0, missing: 1 })
  })

  it('counts an open pikanteria with no answer as missing', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({ pikanteria: [
        { id: 'p1', locked: false, published_at: '2026-06-01T00:00:00Z' },
      ] })],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 1, submitted: 0, missing: 1 })
  })

  it('does not count locked or unpublished items', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({
        matches: [
          { id: 'm-locked', kickoff_time: PAST_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
          { id: 'm-unpublished', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: null },
        ],
        pikanteria: [
          { id: 'p-locked', locked: true, published_at: '2026-06-01T00:00:00Z' },
          { id: 'p-unpublished', locked: false, published_at: null },
        ],
      })],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 0, submitted: 0, missing: 0 })
  })

  it('treats a submitted match as not missing', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({ matches: [
        { id: 'm1', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
      ] })],
      predictedMatchIds: new Set(['m1']),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 1, submitted: 1, missing: 0 })
  })

  it('counts an open futures slot only when futuresOpen is true', () => {
    const closedFutures = computeUserMissingCounts({
      matchDays: [],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(closedFutures).toEqual({ total: 0, submitted: 0, missing: 0 })

    const openIncomplete = computeUserMissingCounts({
      matchDays: [],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: true,
      futuresCompleted: false,
    })
    expect(openIncomplete).toEqual({ total: 1, submitted: 0, missing: 1 })

    const openComplete = computeUserMissingCounts({
      matchDays: [],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: true,
      futuresCompleted: true,
    })
    expect(openComplete).toEqual({ total: 1, submitted: 1, missing: 0 })
  })

  it('combines matches, pikanteria, and futures into one mixed total', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({
        matches: [
          { id: 'm-done', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
          { id: 'm-missing', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
        ],
        pikanteria: [
          { id: 'p-missing', locked: false, published_at: '2026-06-01T00:00:00Z' },
        ],
      })],
      predictedMatchIds: new Set(['m-done']),
      answeredPikanteriaIds: new Set(),
      futuresOpen: true,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 4, submitted: 1, missing: 3 })
  })
})
