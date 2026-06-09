/**
 * Seed script: World Cup 2026 group stage fixtures
 *
 * Populates match_days and matches tables with all 72 group-stage games.
 * Knockout stages (r32 onward) must be added by the admin once teams are known.
 *
 * Run:
 *   npx tsx scripts/seed-wc2026.ts
 *
 * Prerequisites:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in .env.local
 *   - Migration 003_add_r32_stage.sql applied in Supabase SQL Editor
 *
 * All kickoff times are stored as Jerusalem-local ISO timestamps (`+03:00`).
 * Match-day dates use the Jerusalem calendar date as the reference.
 * Lock times are 5 minutes before the earliest kickoff of each Jerusalem day.
 *
 * Odds are pre-tournament estimates; update via /admin/results before each day.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

interface MatchInput {
  home_team: string
  away_team: string
  kickoff_time: string
  odds_home: number
  odds_draw: number
  odds_away: number
}

interface MatchDayInput {
  date: string        // Jerusalem calendar date (YYYY-MM-DD)
  stage: string
  lock_time: string   // Jerusalem timestamp, 5 min before earliest kickoff
  matches: MatchInput[]
}

// ─── Groups ──────────────────────────────────────────────────────────────────
// A: Mexico, South Africa, South Korea, Czechia
// B: Canada, Bosnia-Herzegovina, Qatar, Switzerland
// C: Brazil, Morocco, Haiti, Scotland
// D: USA, Paraguay, Australia, Türkiye
// E: Germany, Curaçao, Côte d'Ivoire, Ecuador
// F: Netherlands, Japan, Sweden, Tunisia
// G: Belgium, Egypt, Iran, New Zealand
// H: Spain, Cabo Verde, Saudi Arabia, Uruguay
// I: France, Senegal, Iraq, Norway
// J: Argentina, Algeria, Austria, Jordan
// K: Portugal, DR Congo, Uzbekistan, Colombia
// L: England, Croatia, Ghana, Panama

const groupStage: MatchDayInput[] = [
  // 2026-06-11 Jerusalem
  {
    date: '2026-06-11',
    stage: 'group',
    lock_time: '2026-06-11T21:55:00+03:00',
    matches: [
      { home_team: 'Mexico', away_team: 'South Africa', kickoff_time: '2026-06-11T22:00:00+03:00', odds_home: 1.65, odds_draw: 3.50, odds_away: 4.50 },
    ],
  },
  // 2026-06-12 Jerusalem
  {
    date: '2026-06-12',
    stage: 'group',
    lock_time: '2026-06-12T04:55:00+03:00',
    matches: [
      { home_team: 'South Korea', away_team: 'Czechia', kickoff_time: '2026-06-12T05:00:00+03:00', odds_home: 2.10, odds_draw: 3.25, odds_away: 3.30 },
      { home_team: 'Canada', away_team: 'Bosnia-Herzegovina', kickoff_time: '2026-06-12T22:00:00+03:00', odds_home: 2.30, odds_draw: 3.20, odds_away: 3.00 },
    ],
  },
  // 2026-06-13 Jerusalem
  {
    date: '2026-06-13',
    stage: 'group',
    lock_time: '2026-06-13T03:55:00+03:00',
    matches: [
      { home_team: 'USA', away_team: 'Paraguay', kickoff_time: '2026-06-13T04:00:00+03:00', odds_home: 1.75, odds_draw: 3.40, odds_away: 4.50 },
      { home_team: 'Qatar', away_team: 'Switzerland', kickoff_time: '2026-06-13T22:00:00+03:00', odds_home: 3.80, odds_draw: 3.30, odds_away: 1.85 },
    ],
  },
  // 2026-06-14 Jerusalem
  {
    date: '2026-06-14',
    stage: 'group',
    lock_time: '2026-06-14T00:55:00+03:00',
    matches: [
      { home_team: 'Brazil', away_team: 'Morocco', kickoff_time: '2026-06-14T01:00:00+03:00', odds_home: 1.40, odds_draw: 4.50, odds_away: 7.00 },
      { home_team: 'Haiti', away_team: 'Scotland', kickoff_time: '2026-06-14T04:00:00+03:00', odds_home: 3.50, odds_draw: 3.20, odds_away: 2.00 },
      { home_team: 'Australia', away_team: 'Türkiye', kickoff_time: '2026-06-14T19:00:00+03:00', odds_home: 2.50, odds_draw: 3.20, odds_away: 2.70 },
      { home_team: 'Germany', away_team: 'Curaçao', kickoff_time: '2026-06-14T20:00:00+03:00', odds_home: 1.05, odds_draw: 14.00, odds_away: 25.00 },
      { home_team: 'Netherlands', away_team: 'Japan', kickoff_time: '2026-06-14T23:00:00+03:00', odds_home: 1.60, odds_draw: 3.60, odds_away: 5.00 },
    ],
  },
  // 2026-06-15 Jerusalem
  {
    date: '2026-06-15',
    stage: 'group',
    lock_time: '2026-06-15T01:55:00+03:00',
    matches: [
      { home_team: 'Côte d\'Ivoire', away_team: 'Ecuador', kickoff_time: '2026-06-15T02:00:00+03:00', odds_home: 2.40, odds_draw: 3.20, odds_away: 2.80 },
      { home_team: 'Sweden', away_team: 'Tunisia', kickoff_time: '2026-06-15T05:00:00+03:00', odds_home: 1.80, odds_draw: 3.35, odds_away: 4.00 },
      { home_team: 'Spain', away_team: 'Cabo Verde', kickoff_time: '2026-06-15T19:00:00+03:00', odds_home: 1.10, odds_draw: 8.00, odds_away: 18.00 },
      { home_team: 'Belgium', away_team: 'Egypt', kickoff_time: '2026-06-15T22:00:00+03:00', odds_home: 1.50, odds_draw: 3.80, odds_away: 6.00 },
    ],
  },
  // 2026-06-16 Jerusalem
  {
    date: '2026-06-16',
    stage: 'group',
    lock_time: '2026-06-16T00:55:00+03:00',
    matches: [
      { home_team: 'Saudi Arabia', away_team: 'Uruguay', kickoff_time: '2026-06-16T01:00:00+03:00', odds_home: 3.00, odds_draw: 3.30, odds_away: 2.20 },
      { home_team: 'Iran', away_team: 'New Zealand', kickoff_time: '2026-06-16T04:00:00+03:00', odds_home: 2.10, odds_draw: 3.25, odds_away: 3.30 },
      { home_team: 'France', away_team: 'Senegal', kickoff_time: '2026-06-16T22:00:00+03:00', odds_home: 1.65, odds_draw: 3.50, odds_away: 4.50 },
    ],
  },
  // 2026-06-17 Jerusalem
  {
    date: '2026-06-17',
    stage: 'group',
    lock_time: '2026-06-17T00:55:00+03:00',
    matches: [
      { home_team: 'Iraq', away_team: 'Norway', kickoff_time: '2026-06-17T01:00:00+03:00', odds_home: 4.00, odds_draw: 3.30, odds_away: 1.80 },
      { home_team: 'Argentina', away_team: 'Algeria', kickoff_time: '2026-06-17T04:00:00+03:00', odds_home: 1.30, odds_draw: 5.00, odds_away: 8.00 },
      { home_team: 'Austria', away_team: 'Jordan', kickoff_time: '2026-06-17T07:00:00+03:00', odds_home: 1.60, odds_draw: 3.60, odds_away: 5.50 },
      { home_team: 'Portugal', away_team: 'DR Congo', kickoff_time: '2026-06-17T20:00:00+03:00', odds_home: 1.35, odds_draw: 4.50, odds_away: 7.50 },
      { home_team: 'England', away_team: 'Croatia', kickoff_time: '2026-06-17T23:00:00+03:00', odds_home: 1.55, odds_draw: 3.70, odds_away: 5.50 },
    ],
  },
  // 2026-06-18 Jerusalem
  {
    date: '2026-06-18',
    stage: 'group',
    lock_time: '2026-06-18T01:55:00+03:00',
    matches: [
      { home_team: 'Ghana', away_team: 'Panama', kickoff_time: '2026-06-18T02:00:00+03:00', odds_home: 2.10, odds_draw: 3.20, odds_away: 3.30 },
      { home_team: 'Uzbekistan', away_team: 'Colombia', kickoff_time: '2026-06-18T05:00:00+03:00', odds_home: 4.50, odds_draw: 3.40, odds_away: 1.70 },
      { home_team: 'Czechia', away_team: 'South Africa', kickoff_time: '2026-06-18T19:00:00+03:00', odds_home: 1.85, odds_draw: 3.35, odds_away: 3.80 },
      { home_team: 'Switzerland', away_team: 'Bosnia-Herzegovina', kickoff_time: '2026-06-18T22:00:00+03:00', odds_home: 1.75, odds_draw: 3.40, odds_away: 4.50 },
    ],
  },
  // 2026-06-19 Jerusalem
  {
    date: '2026-06-19',
    stage: 'group',
    lock_time: '2026-06-19T00:55:00+03:00',
    matches: [
      { home_team: 'Canada', away_team: 'Qatar', kickoff_time: '2026-06-19T01:00:00+03:00', odds_home: 1.70, odds_draw: 3.45, odds_away: 4.80 },
      { home_team: 'Mexico', away_team: 'South Korea', kickoff_time: '2026-06-19T04:00:00+03:00', odds_home: 1.80, odds_draw: 3.40, odds_away: 4.00 },
      { home_team: 'USA', away_team: 'Australia', kickoff_time: '2026-06-19T22:00:00+03:00', odds_home: 1.85, odds_draw: 3.40, odds_away: 3.80 },
    ],
  },
  // 2026-06-20 Jerusalem
  {
    date: '2026-06-20',
    stage: 'group',
    lock_time: '2026-06-20T00:55:00+03:00',
    matches: [
      { home_team: 'Scotland', away_team: 'Morocco', kickoff_time: '2026-06-20T01:00:00+03:00', odds_home: 2.50, odds_draw: 3.20, odds_away: 2.70 },
      { home_team: 'Brazil', away_team: 'Haiti', kickoff_time: '2026-06-20T03:30:00+03:00', odds_home: 1.08, odds_draw: 10.00, odds_away: 22.00 },
      { home_team: 'Türkiye', away_team: 'Paraguay', kickoff_time: '2026-06-20T06:00:00+03:00', odds_home: 2.00, odds_draw: 3.30, odds_away: 3.50 },
      { home_team: 'Netherlands', away_team: 'Sweden', kickoff_time: '2026-06-20T20:00:00+03:00', odds_home: 1.70, odds_draw: 3.45, odds_away: 4.80 },
      { home_team: 'Germany', away_team: 'Côte d\'Ivoire', kickoff_time: '2026-06-20T23:00:00+03:00', odds_home: 1.55, odds_draw: 3.70, odds_away: 5.50 },
    ],
  },
  // 2026-06-21 Jerusalem
  {
    date: '2026-06-21',
    stage: 'group',
    lock_time: '2026-06-21T02:55:00+03:00',
    matches: [
      { home_team: 'Ecuador', away_team: 'Curaçao', kickoff_time: '2026-06-21T03:00:00+03:00', odds_home: 1.45, odds_draw: 4.00, odds_away: 7.00 },
      { home_team: 'Tunisia', away_team: 'Japan', kickoff_time: '2026-06-21T07:00:00+03:00', odds_home: 3.00, odds_draw: 3.30, odds_away: 2.20 },
      { home_team: 'Spain', away_team: 'Saudi Arabia', kickoff_time: '2026-06-21T19:00:00+03:00', odds_home: 1.40, odds_draw: 4.50, odds_away: 7.00 },
      { home_team: 'Belgium', away_team: 'Iran', kickoff_time: '2026-06-21T22:00:00+03:00', odds_home: 1.45, odds_draw: 4.00, odds_away: 6.50 },
    ],
  },
  // 2026-06-22 Jerusalem
  {
    date: '2026-06-22',
    stage: 'group',
    lock_time: '2026-06-22T00:55:00+03:00',
    matches: [
      { home_team: 'Uruguay', away_team: 'Cabo Verde', kickoff_time: '2026-06-22T01:00:00+03:00', odds_home: 1.35, odds_draw: 4.80, odds_away: 8.00 },
      { home_team: 'New Zealand', away_team: 'Egypt', kickoff_time: '2026-06-22T04:00:00+03:00', odds_home: 2.80, odds_draw: 3.20, odds_away: 2.40 },
      { home_team: 'Argentina', away_team: 'Austria', kickoff_time: '2026-06-22T20:00:00+03:00', odds_home: 1.65, odds_draw: 3.50, odds_away: 4.50 },
    ],
  },
  // 2026-06-23 Jerusalem
  {
    date: '2026-06-23',
    stage: 'group',
    lock_time: '2026-06-22T23:55:00+03:00',
    matches: [
      { home_team: 'France', away_team: 'Iraq', kickoff_time: '2026-06-23T00:00:00+03:00', odds_home: 1.30, odds_draw: 5.00, odds_away: 8.50 },
      { home_team: 'Norway', away_team: 'Senegal', kickoff_time: '2026-06-23T03:00:00+03:00', odds_home: 1.80, odds_draw: 3.40, odds_away: 4.00 },
      { home_team: 'Jordan', away_team: 'Algeria', kickoff_time: '2026-06-23T06:00:00+03:00', odds_home: 3.20, odds_draw: 3.20, odds_away: 2.10 },
      { home_team: 'Portugal', away_team: 'Uzbekistan', kickoff_time: '2026-06-23T20:00:00+03:00', odds_home: 1.20, odds_draw: 6.00, odds_away: 12.00 },
      { home_team: 'England', away_team: 'Ghana', kickoff_time: '2026-06-23T23:00:00+03:00', odds_home: 1.55, odds_draw: 3.75, odds_away: 5.50 },
    ],
  },
  // 2026-06-24 Jerusalem
  {
    date: '2026-06-24',
    stage: 'group',
    lock_time: '2026-06-24T01:55:00+03:00',
    matches: [
      { home_team: 'Panama', away_team: 'Croatia', kickoff_time: '2026-06-24T02:00:00+03:00', odds_home: 3.00, odds_draw: 3.30, odds_away: 2.20 },
      { home_team: 'Colombia', away_team: 'DR Congo', kickoff_time: '2026-06-24T05:00:00+03:00', odds_home: 1.55, odds_draw: 3.80, odds_away: 5.50 },
      { home_team: 'Switzerland', away_team: 'Canada', kickoff_time: '2026-06-24T22:00:00+03:00', odds_home: 1.85, odds_draw: 3.40, odds_away: 3.80 },
      { home_team: 'Bosnia-Herzegovina', away_team: 'Qatar', kickoff_time: '2026-06-24T22:00:00+03:00', odds_home: 1.75, odds_draw: 3.40, odds_away: 4.50 },
    ],
  },
  // 2026-06-25 Jerusalem
  {
    date: '2026-06-25',
    stage: 'group',
    lock_time: '2026-06-25T00:55:00+03:00',
    matches: [
      { home_team: 'Scotland', away_team: 'Brazil', kickoff_time: '2026-06-25T01:00:00+03:00', odds_home: 5.50, odds_draw: 3.80, odds_away: 1.45 },
      { home_team: 'Morocco', away_team: 'Haiti', kickoff_time: '2026-06-25T01:00:00+03:00', odds_home: 1.65, odds_draw: 3.50, odds_away: 4.50 },
      { home_team: 'South Korea', away_team: 'South Africa', kickoff_time: '2026-06-25T04:00:00+03:00', odds_home: 1.80, odds_draw: 3.40, odds_away: 4.00 },
      { home_team: 'Czechia', away_team: 'Mexico', kickoff_time: '2026-06-25T04:00:00+03:00', odds_home: 2.50, odds_draw: 3.20, odds_away: 2.70 },
      { home_team: 'Germany', away_team: 'Ecuador', kickoff_time: '2026-06-25T23:00:00+03:00', odds_home: 1.65, odds_draw: 3.50, odds_away: 4.50 },
      { home_team: 'Côte d\'Ivoire', away_team: 'Curaçao', kickoff_time: '2026-06-25T23:00:00+03:00', odds_home: 1.40, odds_draw: 4.50, odds_away: 7.00 },
    ],
  },
  // 2026-06-26 Jerusalem
  {
    date: '2026-06-26',
    stage: 'group',
    lock_time: '2026-06-26T01:55:00+03:00',
    matches: [
      { home_team: 'Netherlands', away_team: 'Tunisia', kickoff_time: '2026-06-26T02:00:00+03:00', odds_home: 1.45, odds_draw: 4.00, odds_away: 6.50 },
      { home_team: 'Japan', away_team: 'Sweden', kickoff_time: '2026-06-26T02:00:00+03:00', odds_home: 2.10, odds_draw: 3.25, odds_away: 3.30 },
      { home_team: 'Türkiye', away_team: 'USA', kickoff_time: '2026-06-26T05:00:00+03:00', odds_home: 2.50, odds_draw: 3.20, odds_away: 2.70 },
      { home_team: 'Paraguay', away_team: 'Australia', kickoff_time: '2026-06-26T05:00:00+03:00', odds_home: 2.80, odds_draw: 3.20, odds_away: 2.40 },
      { home_team: 'Senegal', away_team: 'Iraq', kickoff_time: '2026-06-26T22:00:00+03:00', odds_home: 1.75, odds_draw: 3.40, odds_away: 4.50 },
      { home_team: 'Norway', away_team: 'France', kickoff_time: '2026-06-26T22:00:00+03:00', odds_home: 3.50, odds_draw: 3.20, odds_away: 2.00 },
    ],
  },
  // 2026-06-27 Jerusalem
  {
    date: '2026-06-27',
    stage: 'group',
    lock_time: '2026-06-27T02:55:00+03:00',
    matches: [
      { home_team: 'Egypt', away_team: 'Iran', kickoff_time: '2026-06-27T03:00:00+03:00', odds_home: 2.10, odds_draw: 3.25, odds_away: 3.30 },
      { home_team: 'Belgium', away_team: 'New Zealand', kickoff_time: '2026-06-27T03:00:00+03:00', odds_home: 1.40, odds_draw: 4.80, odds_away: 7.00 },
      { home_team: 'Spain', away_team: 'Uruguay', kickoff_time: '2026-06-27T06:00:00+03:00', odds_home: 1.65, odds_draw: 3.50, odds_away: 4.50 },
      { home_team: 'Saudi Arabia', away_team: 'Cabo Verde', kickoff_time: '2026-06-27T06:00:00+03:00', odds_home: 1.60, odds_draw: 3.55, odds_away: 5.00 },
    ],
  },
  // 2026-06-28 Jerusalem
  {
    date: '2026-06-28',
    stage: 'group',
    lock_time: '2026-06-27T23:55:00+03:00',
    matches: [
      { home_team: 'Panama', away_team: 'England', kickoff_time: '2026-06-28T00:00:00+03:00', odds_home: 5.50, odds_draw: 3.80, odds_away: 1.45 },
      { home_team: 'Croatia', away_team: 'Ghana', kickoff_time: '2026-06-28T00:00:00+03:00', odds_home: 1.70, odds_draw: 3.45, odds_away: 4.80 },
      { home_team: 'Colombia', away_team: 'Portugal', kickoff_time: '2026-06-28T02:30:00+03:00', odds_home: 3.00, odds_draw: 3.30, odds_away: 2.20 },
      { home_team: 'DR Congo', away_team: 'Uzbekistan', kickoff_time: '2026-06-28T02:30:00+03:00', odds_home: 2.50, odds_draw: 3.20, odds_away: 2.70 },
      { home_team: 'Algeria', away_team: 'Austria', kickoff_time: '2026-06-28T05:00:00+03:00', odds_home: 2.20, odds_draw: 3.25, odds_away: 3.20 },
      { home_team: 'Jordan', away_team: 'Argentina', kickoff_time: '2026-06-28T05:00:00+03:00', odds_home: 10.00, odds_draw: 6.00, odds_away: 1.22 },
    ],
  },
]

async function seed() {
  let totalDays = 0
  let totalMatches = 0

  for (const day of groupStage) {
    // Insert match_day
    const { data: md, error: mdErr } = await supabase
      .from('match_days')
      .insert({
        date: day.date,
        stage: day.stage,
        lock_time: day.lock_time,
        published_at: null,
      })
      .select('id')
      .single()

    if (mdErr) {
      console.error(`  ✗ match_day ${day.date}:`, mdErr.message)
      continue
    }

    totalDays++
    console.log(`  ✓ match_day ${day.date} (${day.matches.length} matches)`)

    // Insert matches for this day
    const matchRows = day.matches.map((m) => ({
      match_day_id: md.id,
      home_team: m.home_team,
      away_team: m.away_team,
      kickoff_time: m.kickoff_time,
      odds_home: m.odds_home,
      odds_draw: m.odds_draw,
      odds_away: m.odds_away,
    }))

    const { error: mErr } = await supabase.from('matches').insert(matchRows)

    if (mErr) {
      console.error(`    ✗ matches for ${day.date}:`, mErr.message)
    } else {
      totalMatches += matchRows.length
    }
  }

  console.log(`\nDone: ${totalDays} match days, ${totalMatches} matches inserted.`)
  console.log('All match days are created as drafts (published_at = null).')
  console.log('Publish them via /admin/publish when ready.')
}

seed().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
