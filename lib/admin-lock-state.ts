import { isMatchLocked, matchLockMs } from './lock'

type AdminMatchLockInput = {
  kickoff_time: string
  locked: boolean | null
  result?: string | null
}

export function getAdminMatchLockState(match: AdminMatchLockInput, now: number = Date.now()) {
  const manuallyLocked = match.locked === true
  const timeLocked = now >= matchLockMs(match.kickoff_time)
  const locked = isMatchLocked(match, now)
  const scored = match.result != null

  return {
    locked,
    manuallyLocked,
    timeLocked,
    canToggle: !scored && !timeLocked,
    canUnpublish: !scored && !locked,
    toggleLabel: locked ? 'Unlock' : 'Lock',
    toggleInputLockedValue: manuallyLocked,
  }
}

export function getAdminDayMatchLockState(matches: AdminMatchLockInput[], now: number = Date.now()) {
  const unscoredStates = matches
    .filter(match => match.result == null)
    .map(match => getAdminMatchLockState(match, now))
  const hasUnscoredMatches = unscoredStates.length > 0
  const allLocked = hasUnscoredMatches && unscoredStates.every(state => state.locked)

  return {
    allLocked,
    canToggle: hasUnscoredMatches && unscoredStates.some(state => !state.locked || state.canToggle),
    toggleLabel: allLocked ? 'Unlock all matches' : 'Lock all matches',
    toggleInputLockedValue: allLocked,
  }
}
