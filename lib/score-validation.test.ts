import { describe, it, expect } from 'vitest'
import {
  computeSnapshotValidity,
  SNAPSHOT_EPSILON,
  buildMatchDaySnapshotPayloads,
  selectScoredSnapshotDays,
} from './score-validation'

describe('SNAPSHOT_EPSILON', () => {
  it('is 0.005', () => {
    expect(SNAPSHOT_EPSILON).toBe(0.005)
  })
})

describe('computeSnapshotValidity', () => {
  // perfect agreement
  it('is valid when fresh cumulative equals snapshot sum exactly', () => {
    const { isValid, discrepancy } = computeSnapshotValidity(10, 4, 6)
    expect(isValid).toBe(true)
    expect(discrepancy).toBeNull()
  })

  it('is valid when difference is within epsilon (below threshold)', () => {
    // snapshotSum = 6 + 4 = 10, freshCumulative = 10.004 → diff 0.004 < 0.005
    const { isValid, discrepancy } = computeSnapshotValidity(10.004, 4, 6)
    expect(isValid).toBe(true)
    expect(discrepancy).toBeNull()
  })

  // boundary: exactly at epsilon is NOT valid (strict <)
  it('is invalid when difference equals epsilon exactly', () => {
    // snapshotSum = 10, freshCumulative = 10.005 → diff exactly 0.005 — NOT < epsilon
    const { isValid } = computeSnapshotValidity(10.005, 4, 6)
    expect(isValid).toBe(false)
  })

  it('is invalid when difference exceeds epsilon', () => {
    // snapshotSum = 10, freshCumulative = 10.1
    const { isValid, discrepancy } = computeSnapshotValidity(10.1, 4, 6)
    expect(isValid).toBe(false)
    expect(discrepancy).toBe(0.1)
  })

  it('sets discrepancy to null when valid', () => {
    const { discrepancy } = computeSnapshotValidity(5, 2, 3)
    expect(discrepancy).toBeNull()
  })

  // negative discrepancy: snapshot sum > fresh cumulative
  it('records a negative discrepancy when snapshot sum exceeds fresh cumulative', () => {
    // snapshotSum = 12, freshCumulative = 11.8 → diff -0.2
    const { isValid, discrepancy } = computeSnapshotValidity(11.8, 5, 7)
    expect(isValid).toBe(false)
    expect(discrepancy).toBe(-0.2)
  })

  // rounding: discrepancy is stored as a number rounded to 2 decimal places
  it('rounds discrepancy to 2 decimal places', () => {
    // snapshotSum = 10, freshCumulative = 10.1234 → diff 0.1234 → rounds to 0.12
    const { discrepancy } = computeSnapshotValidity(10.1234, 4, 6)
    expect(discrepancy).toBe(0.12)
  })

  it('discrepancy is a number, not a string', () => {
    const { discrepancy } = computeSnapshotValidity(10.5, 4, 6)
    expect(typeof discrepancy).toBe('number')
  })

  // zero-point day (e.g. user made no predictions)
  it('handles zero day points with matching cumulative', () => {
    const { isValid } = computeSnapshotValidity(3, 0, 3)
    expect(isValid).toBe(true)
  })

  // both match-day and pre-tournament snapshot paths use the same helper;
  // verify that passing otherDaysSum=0 (first snapshot ever) still works
  it('validates correctly when there are no prior snapshots (otherDaysSum = 0)', () => {
    const { isValid, discrepancy } = computeSnapshotValidity(7.5, 7.5, 0)
    expect(isValid).toBe(true)
    expect(discrepancy).toBeNull()
  })
})

describe('buildMatchDaySnapshotPayloads', () => {
  const NOW = '2026-05-29T00:00:00.000Z'

  it('returns empty arrays when there are no users', () => {
    const { toInsert, toUpdate } = buildMatchDaySnapshotPayloads({
      users: [],
      matchDayId: 'day-1',
      stage: 'group',
      matchPredRows: [],
      pikAnswerRows: [],
      allPredRows: [],
      allPikaRows: [],
      preTournRows: [],
      existingSnapshots: [],
      now: NOW,
    })
    expect(toInsert).toHaveLength(0)
    expect(toUpdate).toHaveLength(0)
  })

  it('places user into toInsert when no existing snapshot exists', () => {
    const { toInsert, toUpdate } = buildMatchDaySnapshotPayloads({
      users: [{ id: 'u1' }],
      matchDayId: 'day-1',
      stage: 'group',
      matchPredRows: [],
      pikAnswerRows: [],
      allPredRows: [],
      allPikaRows: [],
      preTournRows: [],
      existingSnapshots: [],
      now: NOW,
    })
    expect(toInsert).toHaveLength(1)
    expect(toUpdate).toHaveLength(0)
    expect(toInsert[0].user_id).toBe('u1')
    expect('id' in toInsert[0]).toBe(false)
  })

  it('places user into toUpdate when an existing snapshot is present', () => {
    const { toInsert, toUpdate } = buildMatchDaySnapshotPayloads({
      users: [{ id: 'u1' }],
      matchDayId: 'day-1',
      stage: 'group',
      matchPredRows: [],
      pikAnswerRows: [],
      allPredRows: [],
      allPikaRows: [],
      preTournRows: [],
      existingSnapshots: [{ id: 'snap-1', user_id: 'u1', match_day_id: 'day-1', day_points: 0 }],
      now: NOW,
    })
    expect(toInsert).toHaveLength(0)
    expect(toUpdate).toHaveLength(1)
    expect(toUpdate[0].id).toBe('snap-1')
  })

  it('sums match prediction points for the given match day only', () => {
    const { toInsert } = buildMatchDaySnapshotPayloads({
      users: [{ id: 'u1' }],
      matchDayId: 'day-1',
      stage: 'group',
      // allPredRows includes both match days — only day-1 points should go into match_points
      matchPredRows: [{ user_id: 'u1', points: 3 }, { user_id: 'u1', points: 2 }],
      pikAnswerRows: [],
      allPredRows: [{ user_id: 'u1', points: 3 }, { user_id: 'u1', points: 2 }, { user_id: 'u1', points: 5 }],
      allPikaRows: [],
      preTournRows: [],
      existingSnapshots: [],
      now: NOW,
    })
    expect(toInsert[0].match_points).toBe(5)
    // cumulative includes the third pred (5) from a different match day
    expect(toInsert[0].cumulative_points).toBe(10)
  })

  it('sums pikanteria points independently from match points', () => {
    const { toInsert } = buildMatchDaySnapshotPayloads({
      users: [{ id: 'u1' }],
      matchDayId: 'day-1',
      stage: 'group',
      matchPredRows: [{ user_id: 'u1', points: 4 }],
      pikAnswerRows: [{ user_id: 'u1', points: 1.5 }],
      allPredRows: [{ user_id: 'u1', points: 4 }],
      allPikaRows: [{ user_id: 'u1', points: 1.5 }],
      preTournRows: [],
      existingSnapshots: [],
      now: NOW,
    })
    expect(toInsert[0].match_points).toBe(4)
    expect(toInsert[0].pikanteria_points).toBe(1.5)
    expect(toInsert[0].day_points).toBe(5.5)
  })

  it('includes pre-tournament points in cumulative but not in day_points', () => {
    const { toInsert } = buildMatchDaySnapshotPayloads({
      users: [{ id: 'u1' }],
      matchDayId: 'day-1',
      stage: 'group',
      matchPredRows: [{ user_id: 'u1', points: 3 }],
      pikAnswerRows: [],
      allPredRows: [{ user_id: 'u1', points: 3 }],
      allPikaRows: [],
      preTournRows: [{ user_id: 'u1', winner_points: 10, top_scorer_points: 5 }],
      existingSnapshots: [],
      now: NOW,
    })
    expect(toInsert[0].day_points).toBe(3)
    expect(toInsert[0].cumulative_points).toBe(18) // 3 + 10 + 5
  })

  it('only sums snapshots from other match days for otherDaysSum (not current)', () => {
    // u1 has an existing snapshot for day-1 (current) and day-2 (other)
    const { toUpdate } = buildMatchDaySnapshotPayloads({
      users: [{ id: 'u1' }],
      matchDayId: 'day-1',
      stage: 'group',
      matchPredRows: [{ user_id: 'u1', points: 4 }],
      pikAnswerRows: [],
      allPredRows: [{ user_id: 'u1', points: 4 }],
      allPikaRows: [],
      preTournRows: [],
      existingSnapshots: [
        { id: 'snap-1', user_id: 'u1', match_day_id: 'day-1', day_points: 0 }, // current, excluded
        { id: 'snap-2', user_id: 'u1', match_day_id: 'day-2', day_points: 7 }, // other day
      ],
      now: NOW,
    })
    // freshCumulative=4, dayPoints=4, otherDaysSum=7 → sum=11, diff=-7 → invalid
    expect(toUpdate[0].is_valid).toBe(false)
    expect(toUpdate[0].discrepancy).toBe(-7)
  })

  it('includes pre-tournament null snapshot row in otherDaysSum', () => {
    const { toInsert } = buildMatchDaySnapshotPayloads({
      users: [{ id: 'u1' }],
      matchDayId: 'day-1',
      stage: 'group',
      matchPredRows: [{ user_id: 'u1', points: 6 }],
      pikAnswerRows: [],
      allPredRows: [{ user_id: 'u1', points: 6 }],
      allPikaRows: [],
      preTournRows: [{ user_id: 'u1', winner_points: 10, top_scorer_points: 5 }],
      existingSnapshots: [
        { id: 'snap-pre', user_id: 'u1', match_day_id: null, day_points: 15 }, // pre-tournament row
      ],
      now: NOW,
    })
    // freshCumulative = 6+10+5=21, dayPoints=6, otherDaysSum=15 → sum=21 → valid
    expect(toInsert[0].is_valid).toBe(true)
    expect(toInsert[0].cumulative_points).toBe(21)
  })

  it('sets calculated_at from the passed now parameter', () => {
    const { toInsert } = buildMatchDaySnapshotPayloads({
      users: [{ id: 'u1' }],
      matchDayId: 'day-1',
      stage: 'group',
      matchPredRows: [],
      pikAnswerRows: [],
      allPredRows: [],
      allPikaRows: [],
      preTournRows: [],
      existingSnapshots: [],
      now: NOW,
    })
    expect(toInsert[0].calculated_at).toBe(NOW)
  })

  it('handles multiple users independently', () => {
    const { toInsert } = buildMatchDaySnapshotPayloads({
      users: [{ id: 'u1' }, { id: 'u2' }],
      matchDayId: 'day-1',
      stage: 'group',
      matchPredRows: [{ user_id: 'u1', points: 3 }, { user_id: 'u2', points: 7 }],
      pikAnswerRows: [],
      allPredRows: [{ user_id: 'u1', points: 3 }, { user_id: 'u2', points: 7 }],
      allPikaRows: [],
      preTournRows: [],
      existingSnapshots: [],
      now: NOW,
    })
    const u1 = toInsert.find(r => r.user_id === 'u1')!
    const u2 = toInsert.find(r => r.user_id === 'u2')!
    expect(u1.match_points).toBe(3)
    expect(u2.match_points).toBe(7)
  })
})

describe('selectScoredSnapshotDays', () => {
  it('includes days with resolved pikanteria even when no match has a result', () => {
    const days = [
      {
        id: 'match-only',
        stage: 'group',
        matches: [{ result: '1' }],
        pikanteria: [{ result: null }],
      },
      {
        id: 'pikanteria-only',
        stage: 'group',
        matches: [{ result: null }],
        pikanteria: [{ result: '2' }],
      },
      {
        id: 'unscored',
        stage: 'group',
        matches: [{ result: null }],
        pikanteria: [{ result: null }],
      },
    ]

    expect(selectScoredSnapshotDays(days).map(day => day.id)).toEqual([
      'match-only',
      'pikanteria-only',
    ])
  })
})
