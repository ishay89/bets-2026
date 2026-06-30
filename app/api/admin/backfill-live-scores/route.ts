import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchFinishedMatches, getFootballDataConfig, canonicalTeamKey, fdNinetyMinuteScore } from '@/lib/football-data'

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

  // Load all DB matches that still have no live score.
  const { data: dbMatches, error: dbErr } = await admin
    .from('matches')
    .select('id, home_team, away_team, external_match_id')
    .is('live_score_home', null)
    .not('published_at', 'is', null)

  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 })

  const rows = (dbMatches ?? []) as {
    id: string; home_team: string; away_team: string; external_match_id: number | null
  }[]

  // Build lookup maps: by external_match_id and by canonical team-name pair.
  const byExternalId = new Map<number, string>()
  const byPairKey    = new Map<string, string>()

  for (const row of rows) {
    if (row.external_match_id != null) byExternalId.set(row.external_match_id, row.id)
    const key = `${canonicalTeamKey(row.home_team)}__vs__${canonicalTeamKey(row.away_team)}`
    byPairKey.set(key, row.id)
  }

  let updated = 0
  const errors: string[] = []

  for (const m of finished) {
    const score = fdNinetyMinuteScore(m.score)
    if (score.home == null || score.away == null) continue

    // 1. Exact external id match.
    let dbId = byExternalId.get(m.id)

    // 2. Canonical team-name pair match.
    if (!dbId && m.homeTeam.name && m.awayTeam.name) {
      const key = `${canonicalTeamKey(m.homeTeam.name)}__vs__${canonicalTeamKey(m.awayTeam.name)}`
      dbId = byPairKey.get(key)
    }

    // 3. Partial home-team prefix match — catches DB rows with garbled names like
    //    "Germany (-3) vs X (+3)" where the real teams are Germany vs Curaçao.
    if (!dbId && m.homeTeam.name) {
      const apiHome = canonicalTeamKey(m.homeTeam.name)
      for (const row of rows) {
        if (canonicalTeamKey(row.home_team).startsWith(apiHome)) {
          dbId = row.id
          break
        }
      }
    }

    if (!dbId) continue

    const { error } = await admin
      .from('matches')
      .update({
        live_status:     'FINISHED',
        live_score_home: score.home,
        live_score_away: score.away,
        live_minute:     null,
      })
      .eq('id', dbId)

    if (error) {
      errors.push(`db_id=${dbId}: ${error.message}`)
    } else {
      updated++
    }
  }

  return NextResponse.json({
    ok: true,
    finished_from_api: finished.length,
    gaps_in_db: rows.length,
    updated,
    errors,
  })
}
