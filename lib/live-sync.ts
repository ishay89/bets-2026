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
import { fdNinetyMinuteScore, fetchAllMatches, getFootballDataConfig, type FootballDataConfig } from './football-data'
import { runResultsSync } from './result-sync-runner'
import type { LiveStatus } from './types'

// A match is in its live window if its kickoff is within the past 200 minutes
// (90 regular + 30 extra time + 30 min penalties + 50 min buffer) or the next
// 10 minutes (pre-match). 200 min covers the worst-case knockout scenario.
const WINDOW_PAST_MS  = 200 * 60 * 1000
const WINDOW_FUTURE_MS = 10 * 60 * 1000

// Only re-sync a match whose live_synced_at is older than this threshold.
const STALE_MS = 60 * 1000

// Check whether any published match in the live window has stale or absent
// live data. Returns false quickly (one cheap indexed DB read) so pages pay no
// latency penalty when no matches are active. Matches already marked FINISHED
// are excluded — once a game is over there is nothing left to live-sync, so a
// finished-but-stale row should not keep waking the sync up.
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
    .or('live_status.is.null,live_status.neq.FINISHED')
    .or(`live_synced_at.is.null,live_synced_at.lt.${staleThreshold}`)
    .limit(1)
    .maybeSingle()

  return data !== null
}

async function syncLiveScores(config: FootballDataConfig): Promise<boolean> {
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

  if (liveWindowMatches.length === 0) return false

  const syncedAt = now.toISOString()
  let anyFinished = false

  for (const m of liveWindowMatches) {
    const score = fdNinetyMinuteScore(m.score)
    const { error } = await supabase
      .from('matches')
      .update({
        live_status:     m.status as LiveStatus,
        live_score_home: score.home,
        live_score_away: score.away,
        live_minute:     m.minute ?? null,
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
  revalidatePath('/u/[userId]', 'layout')
  revalidatePath('/h2h/[opponentId]', 'layout')

  return true
}

// Clear any matches that are stuck in IN_PLAY/PAUSED but whose kickoff is old
// enough that they must have finished. This handles cases where the live window
// expired before the sync could write FINISHED (e.g. extra-time games, or a
// gap in page visits during the match).
async function clearStuckLiveMatches(): Promise<void> {
  const cutoff = new Date(Date.now() - WINDOW_PAST_MS).toISOString()
  const supabase = createAdminClient()
  await supabase
    .from('matches')
    .update({ live_status: 'FINISHED', live_minute: null })
    .in('live_status', ['IN_PLAY', 'PAUSED'])
    .lt('kickoff_time', cutoff)
}

// Public entry point for page after() callbacks and the client poller. Catches
// all errors so a sync failure never surfaces to users (the response is
// already sent at this point for the after() case). Returns whether a sync
// actually wrote new live data, so callers can skip refreshing when nothing
// changed.
export async function maybeSyncLiveScores(): Promise<boolean> {
  const config = getFootballDataConfig()
  if (!config) return false
  try {
    await clearStuckLiveMatches()
    if (!await needsLiveSync()) return false
    return await syncLiveScores(config)
  } catch (err) {
    console.error('[live-sync] background sync error', err)
    return false
  }
}
