import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchFinishedMatches, getFootballDataConfig, canonicalTeamKey, fdDisplayScore } from '@/lib/football-data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const config = getFootballDataConfig()
  if (!config) return NextResponse.json({ ok: false, error: 'FOOTBALL_DATA_API_KEY not set' }, { status: 500 })

  const finished = await fetchFinishedMatches(config)

  const admin = createAdminClient()

  // Load all published DB matches so the route can repair stale non-null
  // display scores from earlier sync behavior, not only fill blank rows.
  const { data: dbMatches, error: dbErr } = await admin
    .from('matches')
    .select('id, home_team, away_team, external_match_id, live_status, live_score_home, live_score_away')
    .not('published_at', 'is', null)

  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 })

  const rows = (dbMatches ?? []) as {
    id: string
    home_team: string
    away_team: string
    external_match_id: number | null
    live_status: string | null
    live_score_home: number | null
    live_score_away: number | null
  }[]

  // Build lookup maps: by external_match_id and by canonical team-name pair.
  const byExternalId = new Map<number, typeof rows[number]>()
  const byPairKey    = new Map<string, typeof rows[number]>()

  for (const row of rows) {
    if (row.external_match_id != null) byExternalId.set(row.external_match_id, row)
    const key = `${canonicalTeamKey(row.home_team)}__vs__${canonicalTeamKey(row.away_team)}`
    byPairKey.set(key, row)
  }

  let updated = 0
  let unchanged = 0
  const errors: string[] = []

  for (const m of finished) {
    // Backfill the DISPLAY score (actual match score, shootout pollution
    // stripped) — consistent with the live poller and settlement writeback.
    const score = fdDisplayScore(m.score)
    if (score.home == null || score.away == null) continue

    // 1. Exact external id match.
    let dbMatch = byExternalId.get(m.id)

    // 2. Canonical team-name pair match.
    if (!dbMatch && m.homeTeam.name && m.awayTeam.name) {
      const key = `${canonicalTeamKey(m.homeTeam.name)}__vs__${canonicalTeamKey(m.awayTeam.name)}`
      dbMatch = byPairKey.get(key)
    }

    // 3. Partial home-team prefix match — catches DB rows with garbled names like
    //    "Germany (-3) vs X (+3)" where the real teams are Germany vs Curaçao.
    if (!dbMatch && m.homeTeam.name) {
      const apiHome = canonicalTeamKey(m.homeTeam.name)
      for (const row of rows) {
        if (canonicalTeamKey(row.home_team).startsWith(apiHome)) {
          dbMatch = row
          break
        }
      }
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
        live_status:     'FINISHED',
        live_score_home: score.home,
        live_score_away: score.away,
        live_minute:     null,
        live_synced_at:  new Date().toISOString(),
      })
      .eq('id', dbMatch.id)

    if (error) {
      errors.push(`db_id=${dbMatch.id}: ${error.message}`)
    } else {
      updated++
    }
  }

  return NextResponse.json({
    ok: true,
    finished_from_api: finished.length,
    published_in_db: rows.length,
    updated,
    unchanged,
    errors,
  })
}
