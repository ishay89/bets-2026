/**
 * One-time fixtures sync: backfill provider match ids + seed knockout rounds.
 *
 * Does two things from the football-data.org schedule:
 *   1. GROUP STAGE — finds each existing group match in the DB (by team pair +
 *      kickoff date) and writes the provider's stable `external_match_id` onto
 *      it. After this, the live results sync joins on the id exactly.
 *   2. KNOCKOUTS — inserts the Round-of-32 / 16 / QF / SF / 3rd / Final matches
 *      that aren't in the DB yet, as DRAFTS with placeholder team names and the
 *      provider id already set. You fill in the real teams (and odds) on
 *      /admin/edit once the bracket is known, then publish.
 *
 * Idempotent: group rows already mapped are left alone; knockout rows whose
 * external_match_id already exists are skipped. Safe to re-run.
 *
 * Run a preview (writes nothing):
 *   npm run sync:fixtures -- --dry
 *
 * Apply it:
 *   npm run sync:fixtures
 *
 * Use a saved JSON file instead of calling the API:
 *   npm run sync:fixtures -- --file ./wc.json --dry
 *
 * Prerequisites in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * and (unless --file is given) FOOTBALL_DATA_API_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import {
  canonicalTeamKey,
  fdStageToStage,
  fetchAllMatches,
  getFootballDataConfig,
  type FdMatch,
} from '../lib/football-data'
import { matchGroupDateKey } from '../lib/time'

config({ path: resolve(process.cwd(), '.env.local') })

const DRY = process.argv.includes('--dry')
const fileArgIdx = process.argv.indexOf('--file')
const filePath = fileArgIdx >= 0 ? process.argv[fileArgIdx + 1] : null

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceRoleKey)

const LOCK_OFFSET_MS = 5 * 60 * 1000
const STAGE_LABEL: Record<string, string> = {
  r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', '3rd': '3rd place', final: 'Final',
}
// Neutral placeholder odds for knockout drafts; set real odds on /admin/edit.
const PLACEHOLDER_ODDS = { odds_home: 2.0, odds_draw: 3.0, odds_away: 3.0 }

function pairKey(home: string, away: string): string {
  return `${canonicalTeamKey(home)}__vs__${canonicalTeamKey(away)}`
}

async function loadMatches(): Promise<FdMatch[]> {
  if (filePath) {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), filePath), 'utf8'))
    return (raw.matches ?? raw) as FdMatch[]
  }
  const fd = getFootballDataConfig()
  if (!fd) {
    console.error('Missing FOOTBALL_DATA_API_KEY in .env.local (or pass --file <path>)')
    process.exit(1)
  }
  return fetchAllMatches(fd)
}

async function main() {
  console.log(DRY ? '\n=== DRY RUN (no writes) ===\n' : '\n=== APPLYING ===\n')
  const all = await loadMatches()
  const group = all.filter(m => fdStageToStage(m.stage) === 'group')
  const knockout = all.filter(m => {
    const s = fdStageToStage(m.stage)
    return s != null && s !== 'group'
  })
  console.log(`Provider matches: ${all.length} (group ${group.length}, knockout ${knockout.length})`)

  // ── 1. GROUP: backfill external_match_id ──────────────────────────────────
  const { data: dbMatches, error: dbErr } = await supabase
    .from('matches')
    .select('id, home_team, away_team, kickoff_time, external_match_id')
  if (dbErr) throw dbErr

  const byPair = new Map<string, { id: string; kickoff_time: string; external_match_id: number | null }[]>()
  for (const m of (dbMatches ?? []) as { id: string; home_team: string; away_team: string; kickoff_time: string; external_match_id: number | null }[]) {
    const k = pairKey(m.home_team, m.away_team)
    const list = byPair.get(k) ?? []
    list.push({ id: m.id, kickoff_time: m.kickoff_time, external_match_id: m.external_match_id })
    byPair.set(k, list)
  }

  let mapped = 0, alreadyMapped = 0, groupUnmatched = 0
  const TOL = 48 * 3600_000
  for (const fd of group) {
    if (!fd.homeTeam.name || !fd.awayTeam.name) { groupUnmatched++; continue }
    const candidates = byPair.get(pairKey(fd.homeTeam.name, fd.awayTeam.name)) ?? []
    const fdTime = new Date(fd.utcDate).getTime()
    let best: typeof candidates[number] | null = null
    let bestDelta = Infinity
    for (const c of candidates) {
      const delta = Math.abs(new Date(c.kickoff_time).getTime() - fdTime)
      if (delta <= TOL && delta < bestDelta) { best = c; bestDelta = delta }
    }
    if (!best) {
      groupUnmatched++
      console.log(`  ⚠ no DB match for ${fd.homeTeam.name} vs ${fd.awayTeam.name} (${fd.utcDate})`)
      continue
    }
    if (best.external_match_id === fd.id) { alreadyMapped++; continue }
    if (best.external_match_id != null && best.external_match_id !== fd.id) {
      console.log(`  ⚠ ${fd.homeTeam.name} vs ${fd.awayTeam.name}: DB already mapped to ${best.external_match_id}, provider says ${fd.id} — skipped`)
      continue
    }
    if (!DRY) {
      const { error } = await supabase.from('matches').update({ external_match_id: fd.id }).eq('id', best.id)
      if (error) throw error
    }
    mapped++
  }
  console.log(`\nGroup: mapped ${mapped}, already mapped ${alreadyMapped}, unmatched ${groupUnmatched}`)

  // ── 2. KNOCKOUTS: insert placeholder drafts with ids ──────────────────────
  const existingIds = new Set(
    ((dbMatches ?? []) as { external_match_id: number | null }[])
      .map(m => m.external_match_id)
      .filter((x): x is number => x != null),
  )

  // Group knockout fixtures by Jerusalem match-day window.
  const days = new Map<string, FdMatch[]>()
  for (const fd of knockout) {
    const dateKey = matchGroupDateKey(fd.utcDate)
    const list = days.get(dateKey) ?? []
    list.push(fd)
    days.set(dateKey, list)
  }

  let daysCreated = 0, koInserted = 0, koSkipped = 0
  for (const [date, dayMatches] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = dayMatches.toSorted((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
    const stage = fdStageToStage(sorted[0].stage)! // all knockout, non-null
    const lockTime = new Date(new Date(sorted[0].utcDate).getTime() - LOCK_OFFSET_MS).toISOString()

    // Find or create the match_day for this date.
    const { data: existingDay, error: dayErr } = await supabase
      .from('match_days').select('id').eq('date', date).maybeSingle()
    if (dayErr) throw dayErr

    let matchDayId = existingDay?.id as string | undefined
    if (!matchDayId) {
      console.log(`  + match_day ${date} (${stage}) — ${sorted.length} matches`)
      if (!DRY) {
        const { data: md, error } = await supabase
          .from('match_days')
          .insert({ date, stage, lock_time: lockTime, published_at: null })
          .select('id').single()
        if (error) throw error
        matchDayId = md.id
      }
      daysCreated++
    }

    let slot = 1
    for (const fd of sorted) {
      const label = STAGE_LABEL[stage] ?? stage.toUpperCase()
      if (existingIds.has(fd.id)) { koSkipped++; slot++; continue }
      const row = {
        match_day_id: matchDayId,
        home_team: `${label} M${slot} · Home`,
        away_team: `${label} M${slot} · Away`,
        kickoff_time: fd.utcDate,
        ...PLACEHOLDER_ODDS,
        external_match_id: fd.id,
      }
      console.log(`    + ${row.home_team} vs ${row.away_team}  (${fd.utcDate}, id ${fd.id})`)
      if (!DRY && matchDayId) {
        const { error } = await supabase.from('matches').insert(row)
        if (error) throw error
      }
      koInserted++
      slot++
    }
  }
  console.log(`\nKnockouts: match_days created ${daysCreated}, matches inserted ${koInserted}, skipped (already present) ${koSkipped}`)
  console.log(DRY ? '\nDry run only — nothing was written.\n' : '\nDone. Set real teams/odds on /admin/edit, then publish.\n')
}

main().catch(err => { console.error(err); process.exit(1) })
