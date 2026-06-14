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
    expect(state.canToggle).toBe(false)
    expect(state.canUnpublish).toBe(false)
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
  })
})

describe('getAdminDayMatchLockState', () => {
  it('uses effective match locks for the bulk lock state', () => {
    const state = getAdminDayMatchLockState([{
      kickoff_time: KICKOFF,
      locked: false,
      result: null,
    }], AT_LOCK)

    expect(state.allLocked).toBe(true)
    expect(state.toggleLabel).toBe('Unlock all matches')
    expect(state.canToggle).toBe(false)
  })
})
