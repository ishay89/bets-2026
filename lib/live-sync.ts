// Background live-score sync — called via after() from page server components.
//
// Reads the live status and score for any World Cup match currently in its
// active window from football-data.org and writes the result to three columns
// on the matches table: live_status, live_score_home, live_score_away.
// These are entirely separate from matches.result, which is the admin-settled
// outcome used for scoring; this code never touches that column.
//
// When a match transitions to FINISHED, or into the post-90-minute phase that
// is final for our betting rules, the function also calls runResultsSync() —
// the same function the nightly cron uses — so settlement happens promptly
// rather than waiting until 3:30 AM UTC.

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createAdminClient } from './supabase/server'
import {
  fetchAllMatches,
  getFootballDataConfig,
  isScorableFdMatch,
  type FootballDataConfig,
} from './football-data'
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

// Fetch the live window and write live_status/score onto each match row. This
// is the one piece both sync paths share, and it is intentionally free of cache
// and settlement side effects (no revalidatePath, no runResultsSync) so it is
// safe to await during a Server Component render. Returns whether any live-
// window match was written and whether any of them is now settleable.
async function writeLiveWindowScores(
  config: FootballDataConfig,
): Promise<{ wrote: boolean; anySettleable: boolean }> {
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

  if (liveWindowMatches.length === 0) return { wrote: false, anySettleable: false }

  const syncedAt = now.toISOString()
  let anySettleable = false

  for (const m of liveWindowMatches) {
    const liveScore = m.score.fullTime
    const liveStatus = m.status as LiveStatus
    const shouldSettle = isScorableFdMatch(m)
    const { error } = await supabase
      .from('matches')
      .update({
        live_status:     liveStatus,
        live_score_home: liveScore.home,
        live_score_away: liveScore.away,
        live_minute:     liveStatus === 'FINISHED' ? null : m.minute ?? null,
        live_synced_at:  syncedAt,
      })
      .eq('external_match_id', m.id)

    if (error) {
      console.error('[live-sync] failed to update external_match_id', m.id, error.message)
    }
    if (shouldSettle) anySettleable = true
  }

  return { wrote: true, anySettleable }
}

// Bust the page caches for surfaces that show live score data.
function revalidateLivePaths(): void {
  revalidatePath('/predict')
  revalidatePath('/board')
  revalidatePath('/leaderboard')
  revalidatePath('/u/[userId]', 'layout')
  revalidatePath('/h2h/[opponentId]', 'layout')
}

async function syncLiveScores(config: FootballDataConfig): Promise<boolean> {
  const { wrote, anySettleable } = await writeLiveWindowScores(config)
  if (!wrote) return false

  // When any match has finished for our app's rules, trigger the existing
  // settlement path so scores settle promptly. runResultsSync is idempotent —
  // already-scored matches are skipped automatically.
  if (anySettleable) {
    await runResultsSync(createAdminClient(), config)
  }

  revalidateLivePaths()
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

// Blocking, render-safe entry point for page Server Components. Awaited BEFORE
// the page fetches its match data so the very first paint already contains live
// scores instead of "VS": the page renders from data the sync just wrote,
// rather than the pre-sync snapshot that after(maybeSyncLiveScores) only
// refreshes on a later poll cycle.
//
// The cheap needsLiveSync() gate keeps non-live-window loads to a single indexed
// read, so pages pay the provider round-trip only while a match is actually
// live. Settlement and cache revalidation are deferred to after(): revalidatePath
// throws if called during render, and scoring is non-urgent for this paint. The
// existing after(maybeSyncLiveScores) call on each page still handles stuck-match
// cleanup and acts as a fallback.
export async function syncLiveScoresBeforeRender(): Promise<void> {
  const config = getFootballDataConfig()
  if (!config) return
  try {
    if (!await needsLiveSync()) return
    const { wrote, anySettleable } = await writeLiveWindowScores(config)
    if (!wrote) return
    after(async () => {
      if (anySettleable) {
        await runResultsSync(createAdminClient(), config)
      }
      revalidateLivePaths()
    })
  } catch (err) {
    console.error('[live-sync] render-blocking sync error', err)
  }
}
