import { createServiceClient } from '@/lib/supabase/server'
import { monkeyMatchPick, monkeyPikanteriaPick } from '@/lib/monkey'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Stage } from '@/lib/types'

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'group', label: 'Group Stage' },
  { value: 'r16', label: 'Round of 16' },
  { value: 'qf', label: 'Quarter Finals' },
  { value: 'sf', label: 'Semi Finals' },
  { value: '3rd', label: 'Third Place' },
  { value: 'final', label: 'Final' },
]

async function publishMatchDay(formData: FormData) {
  'use server'
  const supabase = await createServiceClient()

  const date = formData.get('date') as string
  const stage = formData.get('stage') as Stage

  const matches: {
    home_team: string; away_team: string; kickoff_time: string
    odds_home: number; odds_draw: number; odds_away: number
  }[] = []

  for (let i = 1; i <= 4; i++) {
    const home = (formData.get(`home_${i}`) as string | null)?.trim()
    const away = (formData.get(`away_${i}`) as string | null)?.trim()
    if (!home || !away) continue
    const timeStr = formData.get(`kickoff_${i}`) as string
    matches.push({
      home_team: home,
      away_team: away,
      kickoff_time: new Date(`${date}T${timeStr}:00`).toISOString(),
      odds_home: parseFloat(formData.get(`odds_home_${i}`) as string),
      odds_draw: parseFloat(formData.get(`odds_draw_${i}`) as string),
      odds_away: parseFloat(formData.get(`odds_away_${i}`) as string),
    })
  }

  const pikanteria: { question: string; odds_yes: number; odds_no: number }[] = []
  for (let i = 1; i <= 3; i++) {
    const q = (formData.get(`pik_q_${i}`) as string | null)?.trim()
    if (!q) continue
    pikanteria.push({
      question: q,
      odds_yes: parseFloat(formData.get(`pik_yes_${i}`) as string),
      odds_no: parseFloat(formData.get(`pik_no_${i}`) as string),
    })
  }

  const earliest = Math.min(...matches.map(m => new Date(m.kickoff_time).getTime()))
  const lockTime = new Date(earliest - 30 * 60 * 1000).toISOString()

  const { data: matchDay, error: mdError } = await supabase
    .from('match_days')
    .insert({ date, stage, lock_time: lockTime, published_at: new Date().toISOString() })
    .select()
    .single()
  if (mdError || !matchDay) throw new Error(mdError?.message)

  const { data: insertedMatches } = await supabase
    .from('matches')
    .insert(matches.map(m => ({ ...m, match_day_id: matchDay.id })))
    .select()

  const insertedPika: { id: string }[] = []
  if (pikanteria.length > 0) {
    const { data } = await supabase
      .from('pikanteria')
      .insert(pikanteria.map(p => ({ ...p, match_day_id: matchDay.id })))
      .select()
    if (data) insertedPika.push(...data)
  }

  const { data: monkey } = await supabase.from('users').select('id').eq('is_monkey', true).single()
  if (monkey && insertedMatches?.length) {
    await supabase.from('predictions').insert(
      insertedMatches.map((m: { id: string }) => ({
        user_id: monkey.id, match_id: m.id, pick: monkeyMatchPick(m.id, date),
      }))
    )
  }
  if (monkey && insertedPika.length) {
    await supabase.from('pikanteria_answers').insert(
      insertedPika.map(p => ({
        user_id: monkey.id, pikanteria_id: p.id, answer: monkeyPikanteriaPick(p.id, date),
      }))
    )
  }

  revalidatePath('/predict')
  redirect('/admin/results')
}

const inputBase = {
  background: 'var(--color-bg)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--color-text)',
}
const cls = 'rounded-lg px-3 py-2 text-sm w-full outline-none focus:ring-1'

export default function PublishPage() {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>📋 Publish Match Day</div>
        <div className="text-muted text-xs">Add matches and pikanteria for a new day</div>
      </div>

      <form action={publishMatchDay} className="space-y-6">
        {/* Date + Stage */}
        <div className="rounded-xl p-4 space-y-4"
          style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
            Match Day
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-muted text-xs">Date</label>
              <input type="date" name="date" defaultValue={today} required style={inputBase} className={cls} />
            </div>
            <div className="space-y-1">
              <label className="text-muted text-xs">Stage</label>
              <select name="stage" required style={inputBase} className={cls}>
                {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Matches */}
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
              Match {i}{i > 1 ? ' (optional)' : ''}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-muted text-xs">Home Team</label>
                <input type="text" name={`home_${i}`} placeholder="e.g. France"
                  style={inputBase} className={cls} />
              </div>
              <div className="space-y-1">
                <label className="text-muted text-xs">Away Team</label>
                <input type="text" name={`away_${i}`} placeholder="e.g. Brazil"
                  style={inputBase} className={cls} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['home', 'draw', 'away'].map(k => (
                <div key={k} className="space-y-1">
                  <label className="text-muted text-xs capitalize">Odds {k}</label>
                  <input type="number" step="0.01" name={`odds_${k}_${i}`} placeholder="2.00"
                    style={{ ...inputBase, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}
                    className={cls} />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-muted text-xs">Kickoff</label>
                <input type="time" name={`kickoff_${i}`} style={inputBase} className={cls} />
              </div>
            </div>
          </div>
        ))}

        {/* Pikanteria */}
        <div className="font-bold text-xs uppercase tracking-wider mt-2" style={{ color: 'var(--color-amber)' }}>
          🌶️ Pikanteria
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="space-y-1">
              <label className="text-muted text-xs">Question {i}{i > 1 ? ' (optional)' : ''}</label>
              <input type="text" name={`pik_q_${i}`} placeholder="e.g. Will Mbappé score?"
                style={inputBase} className={cls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-muted text-xs">Yes Odds</label>
                <input type="number" step="0.01" name={`pik_yes_${i}`} placeholder="1.80"
                  style={{ ...inputBase, color: 'var(--color-amber)', fontFamily: 'var(--font-mono)' }}
                  className={cls} />
              </div>
              <div className="space-y-1">
                <label className="text-muted text-xs">No Odds</label>
                <input type="number" step="0.01" name={`pik_no_${i}`} placeholder="2.10"
                  style={{ ...inputBase, color: 'var(--color-amber)', fontFamily: 'var(--font-mono)' }}
                  className={cls} />
              </div>
            </div>
          </div>
        ))}

        <button type="submit" className="w-full py-3 rounded-xl font-black text-sm"
          style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
          🚀 Publish Form
        </button>
      </form>
    </div>
  )
}
