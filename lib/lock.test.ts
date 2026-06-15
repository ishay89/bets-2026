import { describe, it, expect } from 'vitest'
import { LOCK_LEAD_MS, matchLockMs, isMatchLocked, isPikanteriaLocked } from './lock'

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
    expect(isMatchLocked({ kickoff_time: KICKOFF }, now)).toBe(false)
  })

  it('is unlocked 6 minutes before kickoff', () => {
    const now = kickoffMs - 6 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF }, now)).toBe(false)
  })

  it('is locked exactly at kickoff − 5 minutes', () => {
    const now = kickoffMs - LOCK_LEAD_MS
    expect(isMatchLocked({ kickoff_time: KICKOFF }, now)).toBe(true)
  })

  it('is locked after kickoff − 5 minutes', () => {
    const now = kickoffMs - 4 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF }, now)).toBe(true)
  })

  it('is locked when the match is manually locked, regardless of time', () => {
    const now = kickoffMs - 60 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF, locked: true }, now)).toBe(true)
  })

  it('ignores legacy day lock state', () => {
    const now = kickoffMs - 60 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF, locked: false }, now)).toBe(false)
  })

  it('treats null locked as unlocked', () => {
    const now = kickoffMs - 60 * 60 * 1000
    expect(isMatchLocked({ kickoff_time: KICKOFF, locked: null }, now)).toBe(false)
  })
})

describe('isPikanteriaLocked', () => {
  it('is unlocked well before the attached kickoff', () => {
    const now = kickoffMs - 60 * 60 * 1000
    expect(isPikanteriaLocked({ kickoff_time: KICKOFF }, now)).toBe(false)
  })

  it('is unlocked 6 minutes before kickoff', () => {
    const now = kickoffMs - 6 * 60 * 1000
    expect(isPikanteriaLocked({ kickoff_time: KICKOFF }, now)).toBe(false)
  })

  it('locks 5 minutes before the attached kickoff, like a match', () => {
    const now = kickoffMs - LOCK_LEAD_MS
    expect(isPikanteriaLocked({ kickoff_time: KICKOFF }, now)).toBe(true)
  })

  it('is locked after kickoff − 5 minutes', () => {
    const now = kickoffMs - 4 * 60 * 1000
    expect(isPikanteriaLocked({ kickoff_time: KICKOFF }, now)).toBe(true)
  })

  it('is locked when manually locked, regardless of time or missing kickoff', () => {
    const now = kickoffMs - 60 * 60 * 1000
    expect(isPikanteriaLocked({ kickoff_time: KICKOFF, locked: true }, now)).toBe(true)
    expect(isPikanteriaLocked({ kickoff_time: null, locked: true }, now)).toBe(true)
  })

  it('never auto-locks without a kickoff time', () => {
    const now = kickoffMs + 60 * 60 * 1000 // an hour after the would-be kickoff
    expect(isPikanteriaLocked({ kickoff_time: null }, now)).toBe(false)
    expect(isPikanteriaLocked({ kickoff_time: null, locked: false }, now)).toBe(false)
  })
})
