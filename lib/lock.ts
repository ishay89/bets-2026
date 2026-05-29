// Shared locking logic for match predictions.
//
// A match locks 5 minutes before its own kickoff. There is no scheduler — the
// lock is evaluated lazily at request time and persisted (matches.locked) on the
// first save attempt past the deadline so it applies to everyone. Admins can
// also lock a single match (matches.locked) or a whole day (match_days.locked).

export const LOCK_LEAD_MS = 5 * 60 * 1000

/** The instant (ms epoch) a match locks: 5 minutes before kickoff. */
export function matchLockMs(kickoffTime: string): number {
  return new Date(kickoffTime).getTime() - LOCK_LEAD_MS
}

/**
 * Whether a match is locked for predictions.
 * Locked if the match is manually locked, its day is locked, or we're within
 * 5 minutes of kickoff.
 */
export function isMatchLocked(
  match: { kickoff_time: string; locked?: boolean | null },
  dayLocked: boolean = false,
  now: number = Date.now(),
): boolean {
  if (match.locked === true || dayLocked) return true
  return now >= matchLockMs(match.kickoff_time)
}
