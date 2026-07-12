import type { createAdminClient } from './supabase/server'
import {
  canonicalTeamKey,
  fdDisplayScore,
  fetchFinishedMatches,
  getFootballDataConfig,
  type FootballDataConfig,
} from './football-data'

type AdminClient = ReturnType<typeof createAdminClient>

type PublishedMatch = {
  id: string
  home_team: string
  away_team: string
  external_match_id: number | null
  live_status: string | null
  live_score_home: number | null
  live_score_away: number | null
}

export type LiveScoreBackfillSummary = {
  ok: boolean
  reason?: string
  finishedFromApi: number
  publishedInDb: number
  updated: number
  unchanged: number
  errors: string[]
}

export async function backfillLiveScores(
  admin: AdminClient,
  config: FootballDataConfig | null = getFootballDataConfig(),
): Promise<LiveScoreBackfillSummary> {
  if (!config) {
    return {
      ok: false,
      reason: 'FOOTBALL_DATA_API_KEY not set',
      finishedFromApi: 0,
      publishedInDb: 0,
      updated: 0,
      unchanged: 0,
      errors: [],
    }
  }

  const finished = await fetchFinishedMatches(config)
  const { data: dbMatches, error: dbError } = await admin
    .from('matches')
    .select('id, home_team, away_team, external_match_id, live_status, live_score_home, live_score_away')
    .not('published_at', 'is', null)

  if (dbError) throw dbError

  const rows = (dbMatches ?? []) as PublishedMatch[]
  const byExternalId = new Map<number, PublishedMatch>()
  const byPairKey = new Map<string, PublishedMatch>()

  for (const row of rows) {
    if (row.external_match_id != null) byExternalId.set(row.external_match_id, row)
    byPairKey.set(
      `${canonicalTeamKey(row.home_team)}__vs__${canonicalTeamKey(row.away_team)}`,
      row,
    )
  }

  let updated = 0
  let unchanged = 0
  const errors: string[] = []
  const syncedAt = new Date().toISOString()

  for (const match of finished) {
    const score = fdDisplayScore(match.score)
    if (score.home == null || score.away == null) continue

    let dbMatch = byExternalId.get(match.id)

    if (!dbMatch && match.homeTeam.name && match.awayTeam.name) {
      dbMatch = byPairKey.get(
        `${canonicalTeamKey(match.homeTeam.name)}__vs__${canonicalTeamKey(match.awayTeam.name)}`,
      )
    }

    // Preserve the legacy fallback for pre-external-id rows with decorated
    // team labels such as "Germany (-3) vs X (+3)".
    if (!dbMatch && match.homeTeam.name) {
      const apiHome = canonicalTeamKey(match.homeTeam.name)
      dbMatch = rows.find(row => canonicalTeamKey(row.home_team).startsWith(apiHome))
    }

    if (!dbMatch) continue

    if (
      dbMatch.live_status === 'FINISHED'
      && dbMatch.live_score_home === score.home
      && dbMatch.live_score_away === score.away
    ) {
      unchanged++
      continue
    }

    const { error } = await admin
      .from('matches')
      .update({
        live_status: 'FINISHED',
        live_score_home: score.home,
        live_score_away: score.away,
        live_minute: null,
        live_synced_at: syncedAt,
      })
      .eq('id', dbMatch.id)

    if (error) errors.push(`db_id=${dbMatch.id}: ${error.message}`)
    else updated++
  }

  return {
    ok: errors.length === 0,
    finishedFromApi: finished.length,
    publishedInDb: rows.length,
    updated,
    unchanged,
    errors,
  }
}
