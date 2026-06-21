import type { FullMatchDay } from './data'
import type { Match, Pikanteria } from './types'

type MatchBucket = 0 | 1 | 2
const LIVE_REFRESH_WINDOW_PAST_MS = 145 * 60 * 1000
const LIVE_REFRESH_WINDOW_FUTURE_MS = 10 * 60 * 1000
const MISSING_KICKOFF_TIME = Number.MAX_SAFE_INTEGER

export type PredictDayBet =
  | { kind: 'match'; bet: Match }
  | { kind: 'pikanteria'; bet: Pikanteria }

function matchBucket(match: Pick<Match, 'kickoff_time' | 'live_status' | 'result'>, now = Date.now()): MatchBucket {
  if (match.live_status === 'IN_PLAY' || match.live_status === 'PAUSED') return 0
  if (match.result !== null || match.live_status === 'FINISHED') return 2
  if (new Date(match.kickoff_time).getTime() < now) return 2
  return 1
}

function kickoffMs(match: Pick<Match, 'kickoff_time'>): number {
  return new Date(match.kickoff_time).getTime()
}

function itemKickoffMs(item: Match | Pikanteria): number {
  if (!item.kickoff_time) return MISSING_KICKOFF_TIME
  return new Date(item.kickoff_time).getTime()
}

function isLiveMatch(item: PredictDayBet): boolean {
  return item.kind === 'match' && (item.bet.live_status === 'IN_PLAY' || item.bet.live_status === 'PAUSED')
}

export function sortPredictMatches<T extends Pick<Match, 'kickoff_time' | 'live_status' | 'result'>>(
  matches: readonly T[],
  now = Date.now(),
): T[] {
  return matches.toSorted((a, b) => {
    const bucketDiff = matchBucket(a, now) - matchBucket(b, now)
    if (bucketDiff !== 0) return bucketDiff
    return kickoffMs(a) - kickoffMs(b)
  })
}

export function sortPredictDayBets(day: FullMatchDay): PredictDayBet[] {
  return [
    ...day.matches.map((bet): PredictDayBet => ({ kind: 'match', bet })),
    ...day.pikanteria.map((bet): PredictDayBet => ({ kind: 'pikanteria', bet })),
  ].toSorted((a, b) => {
    const liveDiff = Number(isLiveMatch(b)) - Number(isLiveMatch(a))
    if (liveDiff !== 0) return liveDiff
    return itemKickoffMs(a.bet) - itemKickoffMs(b.bet)
  })
}

function dayBucket(day: FullMatchDay, now: number): MatchBucket {
  if (day.matches.some(match => matchBucket(match, now) === 0)) return 0
  if (day.matches.some(match => matchBucket(match, now) === 1)) return 1
  return 2
}

function daySortTime(day: FullMatchDay, now: number): number {
  const bucket = dayBucket(day, now)
  const matchingKickoffs = day.matches
    .filter(match => matchBucket(match, now) === bucket)
    .map(kickoffMs)

  if (matchingKickoffs.length === 0) return new Date(day.date).getTime()
  return bucket === 2 ? Math.max(...matchingKickoffs) : Math.min(...matchingKickoffs)
}

export function sortPredictMatchDays(days: readonly FullMatchDay[], now = Date.now()): FullMatchDay[] {
  return days.toSorted((a, b) => {
    const bucketDiff = dayBucket(a, now) - dayBucket(b, now)
    if (bucketDiff !== 0) return bucketDiff

    const aTime = daySortTime(a, now)
    const bTime = daySortTime(b, now)
    return dayBucket(a, now) === 2 ? bTime - aTime : aTime - bTime
  })
}

export function getPredictLiveRefreshMatchIds(days: readonly FullMatchDay[], now = Date.now()): string[] {
  const windowStart = now - LIVE_REFRESH_WINDOW_PAST_MS
  const windowEnd = now + LIVE_REFRESH_WINDOW_FUTURE_MS

  return sortPredictMatchDays(days, now)
    .flatMap(day => sortPredictMatches(day.matches, now))
    .filter(match => {
      if (match.result !== null) return false
      const kickoff = kickoffMs(match)
      return kickoff >= windowStart && kickoff <= windowEnd
    })
    .map(match => match.id)
}
