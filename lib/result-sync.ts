// Reconciliation between football-data.org matches and our internal matches.
//
// The pure reconcile() takes the published-but-unscored internal matches plus
// the finished provider matches and produces one suggestion per confident
// mapping. Matching is by canonical team pair (home/away order-sensitive)
// within a date tolerance, so we never mix up two legs / repeated fixtures.
// Everything here is deterministic and unit-tested; the impure runner that
// reads/writes Supabase lives in result-sync-runner.ts.

import type { Pick } from './types'
import { canonicalTeamKey, fdScoreToPick, type FdMatch } from './football-data'

export interface InternalMatch {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  result: Pick | null
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
  // fixture — surfaced for logging so name drift is noticed early.
  unmatched: { home: string; away: string; utcDate: string }[]
}

// Default: a provider match may map to an internal fixture whose kickoff is
// within this many hours. Generous enough for timezone storage differences,
// tight enough to disambiguate the same pairing across stages.
const DEFAULT_TOLERANCE_HOURS = 36

function pairKey(home: string, away: string): string {
  return `${canonicalTeamKey(home)}__vs__${canonicalTeamKey(away)}`
}

export function reconcile(
  internalMatches: InternalMatch[],
  fdMatches: FdMatch[],
  opts: { toleranceHours?: number } = {},
): ReconcileResult {
  const toleranceMs = (opts.toleranceHours ?? DEFAULT_TOLERANCE_HOURS) * 3600_000

  // Index unscored internal matches by canonical pairing. A pairing can occur
  // more than once across the tournament, so keep a list and disambiguate by
  // kickoff proximity.
  const byPair = new Map<string, InternalMatch[]>()
  for (const m of internalMatches) {
    if (m.result != null) continue // already scored — leave it alone
    const key = pairKey(m.home_team, m.away_team)
    const list = byPair.get(key) ?? []
    list.push(m)
    byPair.set(key, list)
  }

  const suggestions: SuggestionWrite[] = []
  const unmatched: ReconcileResult['unmatched'] = []
  const usedInternalIds = new Set<string>()

  for (const fd of fdMatches) {
    const home = fd.homeTeam.name
    const away = fd.awayTeam.name
    const pick = fdScoreToPick(fd.score)
    if (!home || !away || pick == null) continue

    const candidates = (byPair.get(pairKey(home, away)) ?? []).filter(
      c => !usedInternalIds.has(c.id),
    )

    // Choose the candidate whose kickoff is closest to the provider's date,
    // within tolerance.
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
    suggestions.push({
      match_id: best.id,
      suggested_result: pick,
      home_score: fd.score.fullTime.home,
      away_score: fd.score.fullTime.away,
      external_match_id: fd.id,
      raw_winner: fd.score.winner,
      duration: fd.score.duration ?? null,
    })
  }

  return { suggestions, unmatched }
}
