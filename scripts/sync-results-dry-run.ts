/**
 * Dry run for the automated results sync.
 *
 * Shows exactly what the auto-scorer WOULD do — which provider games map to
 * which internal fixtures, the 1/X/2 it would enter, and anything it could not
 * match — WITHOUT writing or scoring anything. Run this before enabling the
 * cron so you can eyeball the mapping and spot missing team aliases.
 *
 * Run:
 *   npm run sync:dry
 *
 * Prerequisites in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   FOOTBALL_DATA_API_KEY=...
 *   (optional) FOOTBALL_DATA_COMPETITION=WC
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { fetchFinishedMatches, getFootballDataConfig } from '../lib/football-data'
import { reconcile, type InternalMatch } from '../lib/result-sync'

config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const fdConfig = getFootballDataConfig()
if (!fdConfig) {
  console.error('Missing FOOTBALL_DATA_API_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  // Same projection the runner uses: published, unscored matches.
  const { data, error } = await supabase
    .from('matches')
    .select('id, match_day_id, home_team, away_team, kickoff_time, result')
    .not('published_at', 'is', null)
    .is('result', null)
  if (error) throw error

  const openMatches = (data ?? []) as (InternalMatch & { match_day_id: string })[]
  console.log(`\nOpen (published, unscored) internal matches: ${openMatches.length}`)

  const fdMatches = await fetchFinishedMatches(fdConfig)
  console.log(`Finished provider matches: ${fdMatches.length}`)

  const { suggestions, unmatched } = reconcile(openMatches, fdMatches)

  const nameById = new Map(openMatches.map(m => [m.id, `${m.home_team} vs ${m.away_team}`]))

  console.log(`\n=== WOULD SCORE (${suggestions.length}) ===`)
  for (const s of suggestions) {
    const flag = s.duration && s.duration !== 'REGULAR' ? `  ⚠ ${s.duration} — verify` : ''
    console.log(
      `  ${nameById.get(s.match_id)}  →  ${s.home_score}-${s.away_score}  (${s.suggested_result})${flag}`,
    )
  }

  console.log(`\n=== UNMATCHED PROVIDER GAMES (${unmatched.length}) ===`)
  console.log('  (finished games with no matching open fixture — check for missing team aliases)')
  for (const u of unmatched) {
    console.log(`  ${u.home} vs ${u.away}  @ ${u.utcDate}`)
  }

  const matchedIds = new Set(suggestions.map(s => s.match_id))
  const stillOpen = openMatches.filter(m => !matchedIds.has(m.id))
  console.log(`\n=== OPEN FIXTURES WITH NO RESULT YET (${stillOpen.length}) ===`)
  for (const m of stillOpen) {
    console.log(`  ${m.home_team} vs ${m.away_team}  (kickoff ${m.kickoff_time})`)
  }

  console.log('\nDry run only — nothing was written.\n')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
