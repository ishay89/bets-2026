import { describe, it, expect } from 'vitest'
import { computeSnapshotValidity, SNAPSHOT_EPSILON } from './score-validation'

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
