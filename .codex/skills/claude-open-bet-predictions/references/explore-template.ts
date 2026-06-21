/**
 * Template (step 3): list open published/unlocked/no-result matches and
 * pikanteria with their odds and item ids, plus Claude's leaderboard
 * position and existing picks.
 *
 * Copy to scripts/tmp-explore.ts, run with `npx tsx scripts/tmp-explore.ts`,
 * then delete the copy once the apply step is done.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local'), quiet: true })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const CLAUDE_ID = '00000000-0000-0000-0000-000000000006'
const LOCK_LEAD_MS = 5 * 60 * 1000

function isMatchLocked(match: { locked: boolean | null; kickoff_time: string }, now = Date.now()) {
  if (match.locked) return true
  return now >= new Date(match.kickoff_time).getTime() - LOCK_LEAD_MS
}

async function main() {
  const { data: lb, error: lbErr } = await supabase
    .from('leaderboard')
    .select('current_rank, display_name, total_points, today_points, rank_delta')
    .eq('id', CLAUDE_ID)
    .single()
  if (lbErr) throw lbErr
  console.log('POSITION', lb)

  const { data: days, error } = await supabase
    .from('match_days')
    .select('id, date, stage, matches(*), pikanteria(*)')
    .not('published_at', 'is', null)
    .order('date', { ascending: true })
  if (error) throw error

  for (const day of days ?? []) {
    for (const m of (day.matches ?? []) as any[]) {
      if (m.published_at == null || m.result != null || isMatchLocked(m)) continue
      console.log(
        'MATCH', m.id, day.date,
        JSON.stringify(m.home_team), 'vs', JSON.stringify(m.away_team),
        'odds 1/X/2:', m.odds_home, m.odds_draw, m.odds_away,
        'kickoff:', m.kickoff_time,
      )
    }
    for (const p of (day.pikanteria ?? []) as any[]) {
      if (p.published_at == null || p.result != null || p.locked) continue
      console.log(
        'PIKA', p.id, day.date, JSON.stringify(p.question),
        '1:', p.label_1, p.odds_1, 'X:', p.label_x, p.odds_x, '2:', p.label_2, p.odds_2,
      )
    }
  }

  const { data: preds } = await supabase.from('predictions').select('match_id, pick').eq('user_id', CLAUDE_ID)
  const { data: pikas } = await supabase.from('pikanteria_answers').select('pikanteria_id, pick').eq('user_id', CLAUDE_ID)
  console.log('EXISTING PREDICTIONS', preds)
  console.log('EXISTING PIKANTERIA ANSWERS', pikas)
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
