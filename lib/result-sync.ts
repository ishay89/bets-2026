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
import { canonicalTeamKey, fdScoreToPick, type FdMatch } from './football-data'

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

// Default kickoff tolerance for the name/date fallback only.
const DEFAULT_TOLERANCE_HOURS = 36

function pairKey(home: string, away: string): string {
  return `${canonicalTeamKey(home)}__vs__${canonicalTeamKey(away)}`
}

function buildSuggestion(internal: InternalMatch, fd: FdMatch, pick: Pick): SuggestionWrite {
  return {
    match_id: internal.id,
    suggested_result: pick,
    home_score: fd.score.fullTime.home,
    away_score: fd.score.fullTime.away,
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
