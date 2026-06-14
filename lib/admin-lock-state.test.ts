import { describe, expect, it } from 'vitest'
import { getAdminDayMatchLockState, getAdminMatchLockState } from './admin-lock-state'

const KICKOFF = '2026-06-11T20:00:00.000Z'
const BEFORE_LOCK = new Date('2026-06-11T19:54:59.000Z').getTime()
const AT_LOCK = new Date('2026-06-11T19:55:00.000Z').getTime()

describe('getAdminMatchLockState', () => {
  it('treats a match past the time deadline as locked even when the stored flag is false', () => {
    const state = getAdminMatchLockState({
      kickoff_time: KICKOFF,
      locked: false,
      result: null,
    }, AT_LOCK)

    expect(state.locked).toBe(true)
    expect(state.toggleLabel).toBe('Unlock')
    // Admins can still unlock a time-locked match — that is the override path.
    expect(state.canToggle).toBe(true)
    expect(state.toggleInputLockedValue).toBe(true)
    expect(state.canUnpublish).toBe(false)
  })

  it('reports an active unlock override as open past the deadline', () => {
    const state = getAdminMatchLockState({
      kickoff_time: KICKOFF,
      locked: false,
      unlock_override: true,
      result: null,
    }, AT_LOCK)

    expect(state.locked).toBe(false)
    expect(state.overridden).toBe(true)
    expect(state.timeLocked).toBe(true)
    expect(state.toggleLabel).toBe('Lock')
    expect(state.canToggle).toBe(true)
    expect(state.toggleInputLockedValue).toBe(false)
  })

  it('keeps manually locked future matches unlockable', () => {
    const state = getAdminMatchLockState({
      kickoff_time: KICKOFF,
      locked: true,
      result: null,
    }, BEFORE_LOCK)

    expect(state.locked).toBe(true)
    expect(state.toggleLabel).toBe('Unlock')
    expect(state.canToggle).toBe(true)
    expect(state.toggleInputLockedValue).toBe(true)
  })

  it('keeps future unlocked matches lockable', () => {
    const state = getAdminMatchLockState({
      kickoff_time: KICKOFF,
      locked: false,
      result: null,
    }, BEFORE_LOCK)

    expect(state.locked).toBe(false)
    expect(state.toggleLabel).toBe('Lock')
    expect(state.canToggle).toBe(true)
    expect(state.canUnpublish).toBe(true)
    expect(state.toggleInputLockedValue).toBe(false)
  })

  it('cannot toggle a scored match', () => {
    const state = getAdminMatchLockState({
      kickoff_time: KICKOFF,
      locked: false,
      result: '1',
    }, BEFORE_LOCK)

    expect(state.canToggle).toBe(false)
  })
})

describe('getAdminDayMatchLockState', () => {
  it('uses effective match locks for the bulk lock state', () => {
    const state = getAdminDayMatchLockState([{
      kickoff_time: KICKOFF,
      locked: false,
      result: null,
    }], [], AT_LOCK)

    expect(state.allLocked).toBe(true)
    expect(state.toggleLabel).toBe('Unlock all')
    // Bulk unlock stays available so the admin can override the time lock.
    expect(state.canToggle).toBe(true)
  })

  it('treats the day as not fully locked when a pikanteria is still open', () => {
    const state = getAdminDayMatchLockState(
      [{ kickoff_time: KICKOFF, locked: true, result: null }],
      [{ locked: false, result: null }],
      AT_LOCK,
    )

    expect(state.allLocked).toBe(false)
    expect(state.toggleLabel).toBe('Lock all')
    expect(state.canToggle).toBe(true)
  })

  it('locks the day when matches and pikanteria are all locked', () => {
    const state = getAdminDayMatchLockState(
      [{ kickoff_time: KICKOFF, locked: true, result: null }],
      [{ locked: true, result: null }],
      BEFORE_LOCK,
    )

    expect(state.allLocked).toBe(true)
    expect(state.toggleLabel).toBe('Unlock all')
  })

  it('can still toggle a day with only unscored pikanteria and no open matches', () => {
    const state = getAdminDayMatchLockState(
      [],
      [{ locked: false, result: null }],
      BEFORE_LOCK,
    )

    expect(state.canToggle).toBe(true)
    expect(state.allLocked).toBe(false)
  })
})
