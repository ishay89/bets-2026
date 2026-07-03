// Reconciliation between football-data.org matches and our internal matches.
//
// Preferred path: exact join on external_match_id (the provider's stable match
// id, backfilled onto our rows by scripts/sync-fixtures.ts). Rows that carry an
// id are ONLY matched by id — never by name — so a mapped fixture can't be
// mis-assigned. Rows without an id yet fall back to canonical team pair +
// kickoff proximity (the original heuristic), which is also how the backfill
// establishes the id link in the first place.
//
// Everything here is pure and unit-tested; the impure runner that reads/writes
// Supabase lives in result-sync-runner.ts.

import type { Pick } from './types'
import { canonicalTeamKey, fdNinetyMinuteScore, fdScoreToPick, type FdMatch } from './football-data'

export interface InternalMatch {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  result: Pick | null
  external_match_id?: number | null
}

export interface SuggestionWrite {
  match_id: string
  suggested_result: Pick
  home_score: number | null
  away_score: number | null
  external_match_id: number
  raw_winner: string | null
  duration: string | null
}

export interface ReconcileResult {
  suggestions: SuggestionWrite[]
  // Finished provider matches we could not confidently map to an internal
  // fixture — surfaced for logging so name/id drift is noticed early.
  unmatched: { home: string; away: string; utcDate: string }[]
}

// A write onto the live-score display columns, applied by the runner after a
// match is settled. See buildFinalLiveScoreUpdates below.
export interface FinalLiveScoreUpdate {
  match_id: string
  live_status: 'FINISHED'
  live_score_home: number | null
  live_score_away: number | null
  live_minute: null
}

// When a match auto-settles, reconcile its live-score display columns to the
// SAME 90-minute scoreline that produced the result. The live poller only runs
// on page views inside the match window and can freeze on a mid-game snapshot
// (e.g. Portugal 1-1) if no view lands between the final goal and the game
// leaving the window — leaving a settled card showing a score that contradicts
// its own result chip. Settlement already holds the authoritative scoreline
// (the same one written to the audit trail), so we push it onto the live columns
// here. Only matches that actually scored are written (a match in a failed day
// keeps result IS NULL and must not be shown as FINISHED).
//
// We deliberately use the 90-minute score (what `result` is derived from) rather
// than the provider's full-time score, so the displayed score can never
// disagree with the settled 1/X/2 outcome.
export function buildFinalLiveScoreUpdates(
  suggestions: SuggestionWrite[],
  scoredMatchIds: string[],
): FinalLiveScoreUpdate[] {
  const scored = new Set(scoredMatchIds)
  return suggestions
    .filter(s => scored.has(s.match_id))
    .map(s => ({
      match_id: s.match_id,
      live_status: 'FINISHED',
      live_score_home: s.home_score,
      live_score_away: s.away_score,
      live_minute: null,
    }))
}

// Default kickoff tolerance for the name/date fallback only.
const DEFAULT_TOLERANCE_HOURS = 36

function pairKey(home: string, away: string): string {
  return `${canonicalTeamKey(home)}__vs__${canonicalTeamKey(away)}`
}

function buildSuggestion(internal: InternalMatch, fd: FdMatch, pick: Pick): SuggestionWrite {
  const score = fdNinetyMinuteScore(fd.score)
  return {
    match_id: internal.id,
    suggested_result: pick,
    home_score: score.home,
    away_score: score.away,
    external_match_id: fd.id,
    raw_winner: fd.score.winner,
    duration: fd.score.duration ?? null,
  }
}

export function reconcile(
  internalMatches: InternalMatch[],
  fdMatches: FdMatch[],
  opts: { toleranceHours?: number } = {},
): ReconcileResult {
  const toleranceMs = (opts.toleranceHours ?? DEFAULT_TOLERANCE_HOURS) * 3600_000

  const unscored = internalMatches.filter(m => m.result == null)

  // Exact id index for mapped rows.
  const byId = new Map<number, InternalMatch>()
  for (const m of unscored) {
    if (m.external_match_id != null) byId.set(m.external_match_id, m)
  }

  // Name/date index — only for rows that are NOT yet id-mapped.
  const byPair = new Map<string, InternalMatch[]>()
  for (const m of unscored) {
    if (m.external_match_id != null) continue
    const key = pairKey(m.home_team, m.away_team)
    const list = byPair.get(key) ?? []
    list.push(m)
    byPair.set(key, list)
  }

  const suggestions: SuggestionWrite[] = []
  const unmatched: ReconcileResult['unmatched'] = []
  const usedInternalIds = new Set<string>()

  for (const fd of fdMatches) {
    const pick = fdScoreToPick(fd.score)
    if (pick == null) continue // not finished / no score

    // 1) Exact id match.
    const idMatch = byId.get(fd.id)
    if (idMatch && !usedInternalIds.has(idMatch.id)) {
      usedInternalIds.add(idMatch.id)
      suggestions.push(buildSuggestion(idMatch, fd, pick))
      continue
    }

    // 2) Name + kickoff-proximity fallback (unmapped rows only).
    const home = fd.homeTeam.name
    const away = fd.awayTeam.name
    if (!home || !away) {
      unmatched.push({ home: home ?? '?', away: away ?? '?', utcDate: fd.utcDate })
      continue
    }

    const candidates = (byPair.get(pairKey(home, away)) ?? []).filter(
      c => !usedInternalIds.has(c.id),
    )
    const fdTime = new Date(fd.utcDate).getTime()
    let best: InternalMatch | null = null
    let bestDelta = Infinity
    for (const c of candidates) {
      const delta = Math.abs(new Date(c.kickoff_time).getTime() - fdTime)
      if (delta <= toleranceMs && delta < bestDelta) {
        best = c
        bestDelta = delta
      }
    }

    if (!best) {
      unmatched.push({ home, away, utcDate: fd.utcDate })
      continue
    }

    usedInternalIds.add(best.id)
    suggestions.push(buildSuggestion(best, fd, pick))
  }

  return { suggestions, unmatched }
}
