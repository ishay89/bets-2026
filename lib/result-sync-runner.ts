// Impure orchestration for the results sync. Shared by the Vercel cron route
// and the admin "Sync now" server action. Reads published-but-unscored matches,
// pulls finished matches from football-data.org, reconciles them, and upserts
// advisory suggestion rows. It NEVER scores anything — scoring stays a manual
// admin action through enter_match_day_results.

import type { createAdminClient } from './supabase/server'
import {
  fetchFinishedMatches,
  getFootballDataConfig,
  type FootballDataConfig,
} from './football-data'
import { reconcile, type InternalMatch } from './result-sync'

type AdminClient = ReturnType<typeof createAdminClient>

export interface SyncSummary {
  ok: boolean
  reason?: string
  fetched: number       // finished matches returned by the provider
  matched: number       // suggestions written/updated
  unmatched: number     // finished provider matches with no internal fixture
  unmatchedSample: { home: string; away: string; utcDate: string }[]
}

// Read the matches that are eligible to receive a suggestion: published and not
// yet scored. We pull a light projection — reconciliation only needs names,
// kickoff and current result.
async function loadOpenMatches(supabase: AdminClient): Promise<InternalMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, home_team, away_team, kickoff_time, result')
    .not('published_at', 'is', null)
    .is('result', null)
  if (error) throw error
  return (data ?? []) as InternalMatch[]
}

export async function runResultsSync(
  supabase: AdminClient,
  config: FootballDataConfig | null = getFootballDataConfig(),
): Promise<SyncSummary> {
  const empty = { fetched: 0, matched: 0, unmatched: 0, unmatchedSample: [] }

  if (!config) {
    return { ok: false, reason: 'FOOTBALL_DATA_API_KEY not configured', ...empty }
  }

  const openMatches = await loadOpenMatches(supabase)
  if (openMatches.length === 0) {
    return { ok: true, reason: 'No published, unscored matches to sync', ...empty }
  }

  const fdMatches = await fetchFinishedMatches(config)
  const { suggestions, unmatched } = reconcile(openMatches, fdMatches)

  // Respect dismissals: if an admin dismissed a suggestion, don't resurrect it
  // on the next sync. (Already-scored matches are excluded upstream because
  // loadOpenMatches filters to result IS NULL, so 'applied' rows never reappear.)
  const candidateIds = suggestions.map(s => s.match_id)
  let dismissedIds = new Set<string>()
  if (candidateIds.length > 0) {
    const { data: existing, error: existingErr } = await supabase
      .from('match_result_suggestions')
      .select('match_id, status')
      .in('match_id', candidateIds)
      .eq('status', 'dismissed')
    if (existingErr) throw existingErr
    dismissedIds = new Set((existing ?? []).map((r: { match_id: string }) => r.match_id))
  }

  const writable = suggestions.filter(s => !dismissedIds.has(s.match_id))
  if (writable.length > 0) {
    // Re-syncing the same match should refresh, not duplicate. match_id is the
    // PK, so upsert keeps a single row per fixture.
    const rows = writable.map(s => ({
      ...s,
      status: 'pending' as const,
      fetched_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from('match_result_suggestions')
      .upsert(rows, { onConflict: 'match_id' })
    if (error) throw error
  }

  return {
    ok: true,
    fetched: fdMatches.length,
    matched: writable.length,
    unmatched: unmatched.length,
    unmatchedSample: unmatched.slice(0, 10),
  }
}
