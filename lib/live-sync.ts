// Background live-score sync — called via after() from page server components.
//
// Reads the live status and score for any World Cup match currently in its
// active window from football-data.org and writes the result to three columns
// on the matches table: live_status, live_score_home, live_score_away.
// These are entirely separate from matches.result, which is the admin-settled
// outcome used for scoring; this code never touches that column.
//
// When a match transitions to FINISHED the function also calls runResultsSync()
// — the same function the nightly cron uses — so settlement happens promptly
// rather than waiting until 3:30 AM UTC.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from './supabase/server'
import { fetchAllMatches, getFootballDataConfig, type FootballDataConfig } from './football-data'
import { runResultsSync } from './result-sync-runner'
import type { LiveStatus } from './types'

// A match is in its live window if its kickoff is within the past 145 minutes
// (90 regular + 30 extra + 25 buffer) or the next 10 minutes (pre-match).
const WINDOW_PAST_MS  = 145 * 60 * 1000
const WINDOW_FUTURE_MS = 10 * 60 * 1000

// Only re-sync a match whose live_synced_at is older than this threshold.
const STALE_MS = 60 * 1000

// Check whether any published match in the live window has stale or absent
// live data. Returns false quickly (one cheap indexed DB read) so pages pay no
// latency penalty when no matches are active.
async function needsLiveSync(): Promise<boolean> {
  const now = new Date()
  const windowStart    = new Date(now.getTime() - WINDOW_PAST_MS).toISOString()
  const windowEnd      = new Date(now.getTime() + WINDOW_FUTURE_MS).toISOString()
  const staleThreshold = new Date(now.getTime() - STALE_MS).toISOString()

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('matches')
    .select('id')
    .gte('kickoff_time', windowStart)
    .lte('kickoff_time', windowEnd)
    .not('published_at', 'is', null)
    .or(`live_synced_at.is.null,live_synced_at.lt.${staleThreshold}`)
    .limit(1)
    .maybeSingle()

  return data !== null
}

async function syncLiveScores(config: FootballDataConfig): Promise<void> {
  const supabase = createAdminClient()

  // One API call fetches the entire WC season (~80 matches). Filtering to the
  // live window happens client-side. This avoids two separate status=IN_PLAY
  // and status=PAUSED calls and handles any edge cases around status transitions.
  const allMatches = await fetchAllMatches(config)

  const now = new Date()
  const windowStart = now.getTime() - WINDOW_PAST_MS
  const windowEnd   = now.getTime() + WINDOW_FUTURE_MS

  const liveWindowMatches = allMatches.filter(m => {
    const ms = new Date(m.utcDate).getTime()
    return ms >= windowStart && ms <= windowEnd
  })

  if (liveWindowMatches.length === 0) return

  const syncedAt = now.toISOString()
  let anyFinished = false

  for (const m of liveWindowMatches) {
    const { error } = await supabase
      .from('matches')
      .update({
        live_status:     m.status as LiveStatus,
        live_score_home: m.score.fullTime.home,
        live_score_away: m.score.fullTime.away,
        live_synced_at:  syncedAt,
      })
      .eq('external_match_id', m.id)

    if (error) {
      console.error('[live-sync] failed to update external_match_id', m.id, error.message)
    }
    if (m.status === 'FINISHED') anyFinished = true
  }

  // When any match has finished, trigger the existing settlement path so scores
  // settle promptly. runResultsSync is idempotent — already-scored matches are
  // skipped automatically.
  if (anyFinished) {
    await runResultsSync(supabase, config)
  }

  // Bust the page caches for pages that show live score data.
  revalidatePath('/predict')
  revalidatePath('/board')
  revalidatePath('/leaderboard')
}

// Public entry point for page after() callbacks. Catches all errors so a sync
// failure never surfaces to users (the response is already sent at this point).
export async function maybeSyncLiveScores(): Promise<void> {
  const config = getFootballDataConfig()
  if (!config) return
  try {
    if (!await needsLiveSync()) return
    await syncLiveScores(config)
  } catch (err) {
    console.error('[live-sync] background sync error', err)
  }
}
