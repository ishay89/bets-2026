/**
 * Template (step 6): upsert approved Claude picks (predictions /
 * pikanteria_answers) with matching user_prediction_audit_events rows,
 * mirroring saveAiMatchPick / saveAiPikanteriaPick from
 * app/admin/ai-picks/actions.ts, then validate.
 *
 * Fill in MATCH_PICKS / PIKANTERIA_PICKS with the exact approved
 * { id, pick } pairs from the approval table (item ids from the explore
 * step). Copy to scripts/tmp-apply.ts, run with
 * `npx tsx scripts/tmp-apply.ts`, then delete the copy.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local'), quiet: true })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const CLAUDE_ID = '00000000-0000-0000-0000-000000000006'

const MATCH_PICKS: { match_id: string; pick: '1' | 'X' | '2' }[] = [
  // { match_id: '...', pick: '1' },
]

const PIKANTERIA_PICKS: { pikanteria_id: string; pick: '1' | 'X' | '2' }[] = [
  // { pikanteria_id: '...', pick: '2' },
]

function pikanteriaValue(item: any, pick: string) {
  if (pick === '1') return { pick, label: item.label_1, odds: item.odds_1 }
  if (pick === '2') return { pick, label: item.label_2, odds: item.odds_2 }
  return { pick, label: item.label_x, odds: item.odds_x }
}

async function main() {
  for (const { match_id, pick } of MATCH_PICKS) {
    const { data: match, error: matchErr } = await supabase
      .from('matches')
      .select('*, match_days(date, stage)')
      .eq('id', match_id)
      .single()
    if (matchErr) throw matchErr
    if (match.published_at == null || match.result != null) {
      console.log(`SKIP ${match_id}: not open (published=${match.published_at != null}, result=${match.result})`)
      continue
    }

    const { data: existing } = await supabase
      .from('predictions')
      .select('id, pick')
      .eq('user_id', CLAUDE_ID)
      .eq('match_id', match_id)
      .maybeSingle()

    if (existing?.pick === pick) {
      console.log(`UNCHANGED ${match_id}: already picked ${pick}`)
      continue
    }

    const { data: saved, error: upsertError } = await supabase
      .from('predictions')
      .upsert({ user_id: CLAUDE_ID, match_id, pick, points: null }, { onConflict: 'user_id,match_id' })
      .select('id')
      .single()
    if (upsertError) throw upsertError

    const matchDay = Array.isArray(match.match_days) ? match.match_days[0] : match.match_days
    await supabase.from('user_prediction_audit_events').insert({
      user_id: CLAUDE_ID,
      event_type: 'match_prediction',
      action: existing ? 'update' : 'create',
      entity_id: saved.id,
      entity_ref: match_id,
      old_value: existing ? { pick: existing.pick } : null,
      new_value: { pick },
      metadata: {
        match_id: match.id,
        match_day_id: match.match_day_id,
        date: matchDay?.date,
        stage: matchDay?.stage,
        home_team: match.home_team,
        away_team: match.away_team,
        kickoff_time: match.kickoff_time,
        odds_home: match.odds_home,
        odds_draw: match.odds_draw,
        odds_away: match.odds_away,
        entered_by_admin: true,
      },
    })
    console.log(`SAVED ${match.home_team} vs ${match.away_team}: pick=${pick} (${existing ? 'update' : 'create'})`)
  }

  for (const { pikanteria_id, pick } of PIKANTERIA_PICKS) {
    const { data: item, error: itemErr } = await supabase
      .from('pikanteria')
      .select('*')
      .eq('id', pikanteria_id)
      .single()
    if (itemErr) throw itemErr
    if (item.published_at == null || item.result != null || item.locked) {
      console.log(`SKIP ${pikanteria_id}: not open (published=${item.published_at != null}, result=${item.result}, locked=${item.locked})`)
      continue
    }

    const { data: existing } = await supabase
      .from('pikanteria_answers')
      .select('id, pick')
      .eq('user_id', CLAUDE_ID)
      .eq('pikanteria_id', pikanteria_id)
      .maybeSingle()

    if (existing?.pick === pick) {
      console.log(`UNCHANGED ${pikanteria_id}: already picked ${pick}`)
      continue
    }

    const { data: saved, error: upsertError } = await supabase
      .from('pikanteria_answers')
      .upsert({ user_id: CLAUDE_ID, pikanteria_id, pick, points: null }, { onConflict: 'user_id,pikanteria_id' })
      .select('id')
      .single()
    if (upsertError) throw upsertError

    await supabase.from('user_prediction_audit_events').insert({
      user_id: CLAUDE_ID,
      event_type: 'pikanteria_answer',
      action: existing ? 'update' : 'create',
      entity_id: saved.id,
      entity_ref: pikanteria_id,
      old_value: existing ? pikanteriaValue(item, existing.pick) : null,
      new_value: pikanteriaValue(item, pick),
      metadata: {
        pikanteria_id: item.id,
        match_day_id: item.match_day_id,
        question: item.question,
        label_1: item.label_1,
        label_2: item.label_2,
        label_x: item.label_x,
        odds_1: item.odds_1,
        odds_2: item.odds_2,
        odds_x: item.odds_x,
        entered_by_admin: true,
      },
    })
    console.log(`SAVED pikanteria "${item.question}": pick=${pick} (${existing ? 'update' : 'create'})`)
  }

  // Validate: Claude's row matches the approved pick, and the number of
  // other users' rows on each item is reported for a sanity check.
  for (const { match_id, pick } of MATCH_PICKS) {
    const { data: rows } = await supabase.from('predictions').select('user_id, pick').eq('match_id', match_id)
    const claude = (rows ?? []).find(r => r.user_id === CLAUDE_ID)
    const others = (rows ?? []).filter(r => r.user_id !== CLAUDE_ID)
    const ok = claude?.pick === pick
    console.log(`VALIDATE match ${match_id}: claude.pick=${claude?.pick} expected=${pick} ${ok ? 'OK' : 'MISMATCH'}, other_rows=${others.length}`)
  }
  for (const { pikanteria_id, pick } of PIKANTERIA_PICKS) {
    const { data: rows } = await supabase.from('pikanteria_answers').select('user_id, pick').eq('pikanteria_id', pikanteria_id)
    const claude = (rows ?? []).find(r => r.user_id === CLAUDE_ID)
    const others = (rows ?? []).filter(r => r.user_id !== CLAUDE_ID)
    const ok = claude?.pick === pick
    console.log(`VALIDATE pikanteria ${pikanteria_id}: claude.pick=${claude?.pick} expected=${pick} ${ok ? 'OK' : 'MISMATCH'}, other_rows=${others.length}`)
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
