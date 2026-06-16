/**
 * Sync odds from winner.co.il 1X2 (full time, no extra time) table into the
 * matches table. Only updates UNPUBLISHED matches (published_at IS NULL).
 * Never touches published_at — publishing is a separate admin action.
 *
 * Usage:
 *   npm run sync:winner-odds             # update DB
 *   npm run sync:winner-odds -- --dry    # preview only, no writes
 *
 * Prerequisites: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * To update with new odds: replace WINNER_ODDS below with the freshly scraped
 * data, then re-run. See SKILL.md in this directory for the full workflow.
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

const isDryRun = process.argv.includes('--dry')

// ─── Team name normalization (mirrors lib/football-data.ts) ───────────────────

function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Maps any known variant (seed name or provider name) → canonical key.
// Both sides of a comparison go through this, so entries only need to exist once.
const TEAM_ALIASES: Record<string, string> = {
  'czechia': 'czech republic',
  'turkiye': 'turkey',
  'cote d ivoire': 'ivory coast',
  'cabo verde': 'cape verde',
  'cape verde islands': 'cape verde',
  'bosnia herzegovina': 'bosnia and herzegovina',
  'dr congo': 'congo dr',
  'south korea': 'korea republic',
  'iran': 'ir iran',
  'usa': 'united states',
  'curacao': 'curacao',
}

function canonicalTeamKey(name: string): string {
  const norm = normalizeTeamName(name)
  return TEAM_ALIASES[norm] ?? norm
}

// ─── Winner.co.il odds scraped 2026-06-16 ────────────────────────────────────
// Source URL:
//   https://www.winner.co.il/משחקים/וינר-ליין/כדורגל/בינלאומי/בינלאומי$מונדיאל 2026/‮1X2‬ - תוצאת סיום (ללא הארכות)/כל-היחסים
//
// teamA / teamB = left/right as listed on the winner page (matches home_team /
// away_team in our DB seed for all group-stage fixtures).
// Kickoff times are Israel local (Asia/Jerusalem, UTC+3); winner shows XX:59
// which is 1 min before actual kickoff.

interface WinnerRow {
  teamA: string
  oddsA: number
  oddsDraw: number
  teamB: string
  oddsB: number
}

const WINNER_ODDS: WinnerRow[] = [
  // Jun 16
  { teamA: 'France',        oddsA: 1.35, oddsDraw: 4.40, teamB: 'Senegal',               oddsB: 6.90  },
  // Jun 17
  { teamA: 'Iraq',          oddsA: 11.50, oddsDraw: 5.80, teamB: 'Norway',               oddsB: 1.20  },
  { teamA: 'Argentina',     oddsA: 1.30, oddsDraw: 4.50, teamB: 'Algeria',               oddsB: 8.40  },
  { teamA: 'Austria',       oddsA: 1.25, oddsDraw: 5.50, teamB: 'Jordan',                oddsB: 7.70  },
  { teamA: 'Portugal',      oddsA: 1.20, oddsDraw: 5.50, teamB: 'DR Congo',              oddsB: 10.50 },
  { teamA: 'England',       oddsA: 1.65, oddsDraw: 3.50, teamB: 'Croatia',               oddsB: 4.50  },
  // Jun 18
  { teamA: 'Ghana',         oddsA: 2.10, oddsDraw: 3.10, teamB: 'Panama',                oddsB: 3.15  },
  { teamA: 'Uzbekistan',    oddsA: 8.00, oddsDraw: 4.30, teamB: 'Colombia',              oddsB: 1.35  },
  { teamA: 'Czech Republic', oddsA: 1.70, oddsDraw: 3.45, teamB: 'South Africa',         oddsB: 4.30  },
  { teamA: 'Switzerland',   oddsA: 1.50, oddsDraw: 3.75, teamB: 'Bosnia and Herzegovina', oddsB: 5.60 },
  // Jun 19
  { teamA: 'Canada',        oddsA: 1.25, oddsDraw: 5.00, teamB: 'Qatar',                 oddsB: 9.80  },
  { teamA: 'Mexico',        oddsA: 1.90, oddsDraw: 3.05, teamB: 'South Korea',           oddsB: 3.85  },
  { teamA: 'United States', oddsA: 1.55, oddsDraw: 3.75, teamB: 'Australia',             oddsB: 5.00  },
  // Jun 20
  { teamA: 'Scotland',      oddsA: 4.60, oddsDraw: 3.35, teamB: 'Morocco',               oddsB: 1.70  },
  { teamA: 'Brazil',        oddsA: 1.05, oddsDraw: 9.00, teamB: 'Haiti',                 oddsB: 17.00 },
  { teamA: 'Turkey',        oddsA: 1.90, oddsDraw: 3.15, teamB: 'Paraguay',              oddsB: 3.70  },
  { teamA: 'Netherlands',   oddsA: 1.60, oddsDraw: 3.70, teamB: 'Sweden',                oddsB: 4.60  },
  { teamA: 'Germany',       oddsA: 1.50, oddsDraw: 4.00, teamB: 'Ivory Coast',           oddsB: 5.20  },
  // Jun 21
  { teamA: 'Ecuador',       oddsA: 1.05, oddsDraw: 7.80, teamB: 'Curaçao',              oddsB: 21.00 },
  { teamA: 'Tunisia',       oddsA: 6.20, oddsDraw: 3.70, teamB: 'Japan',                 oddsB: 1.50  },
  { teamA: 'Spain',         oddsA: 1.10, oddsDraw: 7.40, teamB: 'Saudi Arabia',          oddsB: 19.00 },
  { teamA: 'Belgium',       oddsA: 1.40, oddsDraw: 4.20, teamB: 'Iran',                  oddsB: 6.80  },
  // Jun 22
  { teamA: 'Uruguay',       oddsA: 1.45, oddsDraw: 3.75, teamB: 'Cape Verde',            oddsB: 6.40  },
  { teamA: 'New Zealand',   oddsA: 5.20, oddsDraw: 3.60, teamB: 'Egypt',                 oddsB: 1.55  },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (isDryRun) console.log('DRY RUN — no writes will happen\n')

  const { data: matches, error: fetchErr } = await supabase
    .from('matches')
    .select('id, home_team, away_team, kickoff_time, published_at, odds_home, odds_draw, odds_away')

  if (fetchErr || !matches) {
    console.error('Failed to fetch matches:', fetchErr)
    process.exit(1)
  }

  // Build lookup: "canonical(home)|canonical(away)" → match row
  const matchMap = new Map<string, typeof matches[number]>()
  for (const m of matches) {
    const key = `${canonicalTeamKey(m.home_team)}|${canonicalTeamKey(m.away_team)}`
    matchMap.set(key, m)
  }

  let updated = 0
  let skippedPublished = 0
  let notFound = 0

  for (const row of WINNER_ODDS) {
    const canonA = canonicalTeamKey(row.teamA)
    const canonB = canonicalTeamKey(row.teamB)

    // Try normal ordering, then reversed (in case fixture is stored with teams swapped)
    let match = matchMap.get(`${canonA}|${canonB}`)
    let reversed = false
    if (!match) {
      match = matchMap.get(`${canonB}|${canonA}`)
      if (match) reversed = true
    }

    const label = `${row.teamA} vs ${row.teamB}`

    if (!match) {
      console.log(`NOT FOUND  : ${label}  (canonical: ${canonA} | ${canonB})`)
      notFound++
      continue
    }

    if (match.published_at !== null) {
      console.log(`SKIP       : ${match.home_team} vs ${match.away_team}  (already published)`)
      skippedPublished++
      continue
    }

    // Map odds — if the fixture is stored reversed, swap home/away odds
    const oddsHome = reversed ? row.oddsB : row.oddsA
    const oddsDraw = row.oddsDraw
    const oddsAway = reversed ? row.oddsA : row.oddsB

    const kickoff = match.kickoff_time.slice(0, 16) // YYYY-MM-DDTHH:MM

    if (isDryRun) {
      console.log(`WOULD UPDATE: ${match.home_team} vs ${match.away_team} (${kickoff})`)
      console.log(`              ${match.odds_home}/${match.odds_draw}/${match.odds_away} → ${oddsHome}/${oddsDraw}/${oddsAway}`)
      updated++
      continue
    }

    const { error: updateErr } = await supabase
      .from('matches')
      .update({ odds_home: oddsHome, odds_draw: oddsDraw, odds_away: oddsAway })
      .eq('id', match.id)

    if (updateErr) {
      console.error(`UPDATE FAIL: ${match.home_team} vs ${match.away_team}`, updateErr)
    } else {
      console.log(`UPDATED    : ${match.home_team} vs ${match.away_team} (${kickoff})`)
      console.log(`             ${match.odds_home}/${match.odds_draw}/${match.odds_away} → ${oddsHome}/${oddsDraw}/${oddsAway}`)
      updated++
    }
  }

  console.log(`\n─── Summary ────────────────────────────────────────`)
  console.log(`  Updated:          ${updated}`)
  console.log(`  Skipped (published): ${skippedPublished}`)
  console.log(`  Not found in DB:  ${notFound}`)
  console.log(`  Total Winner rows: ${WINNER_ODDS.length}`)
}

main()
