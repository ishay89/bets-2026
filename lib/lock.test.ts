import { describe, it, expect } from 'vitest'
import { LOCK_LEAD_MS, matchLockMs, isMatchLocked, earliestPublishedLockTime } from './lock'

const KICKOFF = '2026-06-11T18:00:00.000Z'
const kickoffMs = new Date(KICKOFF).getTime()

describe('matchLockMs', () => {
  it('is 5 minutes before kickoff', () => {
    expect(matchLockMs(KICKOFF)).toBe(kickoffMs - LOCK_LEAD_MS)
  })
})

describe('isMatchLocked', () => {
  it('is unlocked well before kickoff', () => {
    const now = kickoffMs - 60 * 60 * 1000 // 1 hour before
    expect(isMatchLocked({ kickoff_time: KICKOFF }, false, now)).toBe(false)
  })

  it('is unlocked 6 minutes before kickoff', () => {
    const now = kickoffMs - 6 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF }, false, now)).toBe(false)
  })

  it('is locked exactly at kickoff − 5 minutes', () => {
    const now = kickoffMs - LOCK_LEAD_MS
    expect(isMatchLocked({ kickoff_time: KICKOFF }, false, now)).toBe(true)
  })

  it('is locked after kickoff − 5 minutes', () => {
    const now = kickoffMs - 4 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF }, false, now)).toBe(true)
  })

  it('is locked when the match is manually locked, regardless of time', () => {
    const now = kickoffMs - 60 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF, locked: true }, false, now)).toBe(true)
  })

  it('is locked when the day is locked, regardless of time', () => {
    const now = kickoffMs - 60 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF, locked: false }, true, now)).toBe(true)
  })

  it('treats null locked as unlocked', () => {
    const now = kickoffMs - 60 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF, locked: null }, false, now)).toBe(false)
  })
})

describe('earliestPublishedLockTime', () => {
  it('returns null for an empty list (caller falls back)', () => {
    expect(earliestPublishedLockTime([])).toBeNull()
  })

  it('is 5 minutes before a single kickoff', () => {
    expect(earliestPublishedLockTime([KICKOFF]))
      .toBe(new Date(kickoffMs - LOCK_LEAD_MS).toISOString())
  })

  it('uses the earliest kickoff among several, regardless of order', () => {
    const earlier = '2026-06-11T15:00:00.000Z'
    const later = '2026-06-11T21:00:00.000Z'
    const expected = new Date(new Date(earlier).getTime() - LOCK_LEAD_MS).toISOString()
    expect(earliestPublishedLockTime([later, earlier, KICKOFF])).toBe(expected)
  })
})
