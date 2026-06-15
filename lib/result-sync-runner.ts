// Impure orchestration for the automated results sync. Shared by the Vercel
// cron route and the admin "Sync now" server action. Reads published-but-
// unscored matches, pulls finished matches from football-data.org, reconciles
// them to internal fixtures, and SCORES the confidently-matched ones directly
// through enter_match_day_results — no admin approval step.
//
// A row is written to match_result_suggestions for every auto-scored match as
// an audit trail (status 'applied'). Pikanteria are never auto-scored.

import type { createAdminClient } from './supabase/server'
import {
  fetchFinishedMatches,
  getFootballDataConfig,
  type FootballDataConfig,
} from './football-data'
import { reconcile, type InternalMatch } from './result-sync'
import { autoScoreMatches, type MatchToScore } from './score-matches'

type AdminClient = ReturnType<typeof createAdminClient>

type OpenMatch = InternalMatch & { match_day_id: string }

export interface SyncSummary {
  ok: boolean
  reason?: string
  fetched: number       // finished matches returned by the provider
  matched: number       // provider matches mapped to an internal fixture
  scored: number        // matches actually scored this run
  unmatched: number     // finished provider matches with no internal fixture
  failures: { matchDayId: string; error: string }[]
  unmatchedSample: { home: string; away: string; utcDate: string }[]
}

// Matches eligible to be scored: published and not yet scored.
async function loadOpenMatches(supabase: AdminClient): Promise<OpenMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, match_day_id, home_team, away_team, kickoff_time, result')
    .not('published_at', 'is', null)
    .is('result', null)
  if (error) throw error
  return (data ?? []) as OpenMatch[]
}

export async function runResultsSync(
  supabase: AdminClient,
  config: FootballDataConfig | null = getFootballDataConfig(),
): Promise<SyncSummary> {
  const empty = { fetched: 0, matched: 0, scored: 0, unmatched: 0, failures: [], unmatchedSample: [] }

  if (!config) {
    return { ok: false, reason: 'FOOTBALL_DATA_API_KEY not configured', ...empty }
  }

  const openMatches = await loadOpenMatches(supabase)
  if (openMatches.length === 0) {
    return { ok: true, reason: 'No published, unscored matches to sync', ...empty }
  }

  const dayByMatch = new Map(openMatches.map(m => [m.id, m.match_day_id]))
  const fdMatches = await fetchFinishedMatches(config)
  const { suggestions, unmatched } = reconcile(openMatches, fdMatches)

  // Score every confidently-matched finished game. enter_match_day_results is
  // idempotent for our purposes: scored matches get result set + locked, so the
  // next run won't pick them up again.
  const toScore: MatchToScore[] = suggestions
    .map(s => ({ matchId: s.match_id, matchDayId: dayByMatch.get(s.match_id) ?? '', result: s.suggested_result }))
    .filter(s => s.matchDayId !== '')

  const { scoredMatchIds, failures } = await autoScoreMatches(supabase, toScore)

  // Audit trail: record what we scored (and the provider scoreline) so an admin
  // can see why each result was entered.
  const scoredSet = new Set(scoredMatchIds)
  const auditRows = suggestions
    .filter(s => scoredSet.has(s.match_id))
    .map(s => ({
      match_id: s.match_id,
      suggested_result: s.suggested_result,
      home_score: s.home_score,
      away_score: s.away_score,
      external_match_id: s.external_match_id,
      raw_winner: s.raw_winner,
      duration: s.duration,
      status: 'applied' as const,
      fetched_at: new Date().toISOString(),
    }))
  if (auditRows.length > 0) {
    const { error } = await supabase
      .from('match_result_suggestions')
      .upsert(auditRows, { onConflict: 'match_id' })
    if (error) throw error
  }

  return {
    ok: failures.length === 0,
    fetched: fdMatches.length,
    matched: suggestions.length,
    scored: scoredMatchIds.length,
    unmatched: unmatched.length,
    failures,
    unmatchedSample: unmatched.slice(0, 10),
  }
}
