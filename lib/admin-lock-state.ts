import { isMatchLocked, matchLockMs } from './lock'

type AdminMatchLockInput = {
  kickoff_time: string
  locked: boolean | null
  unlock_override?: boolean | null
  result?: string | null
}

export function getAdminMatchLockState(match: AdminMatchLockInput, now: number = Date.now()) {
  const manuallyLocked = match.locked === true
  const overridden = match.unlock_override === true
  const timeLocked = now >= matchLockMs(match.kickoff_time)
  const locked = isMatchLocked(match, now)
  const scored = match.result != null

  return {
    locked,
    manuallyLocked,
    overridden,
    timeLocked,
    // Admins can always toggle the lock on an unscored match. Unlocking inside
    // the time window records an override so the match stays open.
    canToggle: !scored,
    canUnpublish: !scored && !locked,
    toggleLabel: locked ? 'Unlock' : 'Lock',
    toggleInputLockedValue: locked,
  }
}

type AdminDayPikanteriaInput = {
  locked: boolean | null
  result?: string | null
}

// The bulk day toggle covers both matches and pikanteria for the day, so its
// state reflects every unscored bet, not just the matches.
export function getAdminDayMatchLockState(
  matches: AdminMatchLockInput[],
  pikanteria: AdminDayPikanteriaInput[] = [],
  now: number = Date.now(),
) {
  const unscoredMatchStates = matches
    .filter(match => match.result == null)
    .map(match => getAdminMatchLockState(match, now))
  const unscoredPikanteria = pikanteria.filter(item => item.result == null)
  const hasUnscoredItems = unscoredMatchStates.length > 0 || unscoredPikanteria.length > 0
  const allLocked = hasUnscoredItems
    && unscoredMatchStates.every(state => state.locked)
    && unscoredPikanteria.every(item => item.locked === true)

  return {
    allLocked,
    // Bulk lock/unlock is always available while the day has unscored bets;
    // unlocking forces every unscored match open past its deadline and clears
    // the pikanteria locks.
    canToggle: hasUnscoredItems,
    toggleLabel: allLocked ? 'Unlock all' : 'Lock all',
    toggleInputLockedValue: allLocked,
  }
}
