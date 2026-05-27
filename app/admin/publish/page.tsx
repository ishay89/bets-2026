import { createAdminClient } from '@/lib/supabase/server'
import { monkeyMatchPick, monkeyPikanteriaPick } from '@/lib/monkey'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { PicanteriaBuilder } from '@/components/pikanteria-builder'

async function publishMatchDay(formData: FormData) {
  'use server'
  const supabase = createAdminClient()

  const matchDayId = formData.get('match_day_id') as string
  const date = formData.get('date') as string

  // Update odds for each match (hidden inputs carry match UUIDs)
  for (let i = 1; i <= 8; i++) {
    const matchId = (formData.get(`match_id_${i}`) as string | null)?.trim()
    if (!matchId) break
    await supabase.from('matches').update({
      odds_home: parseFloat(formData.get(`odds_home_${i}`) as string),
      odds_draw: parseFloat(formData.get(`odds_draw_${i}`) as string),
      odds_away: parseFloat(formData.get(`odds_away_${i}`) as string),
    }).eq('id', matchId)
  }

  // Recalculate lock_time from stored kickoff times
  const { data: kickoffRows } = await supabase
    .from('matches')
    .select('kickoff_time')
    .eq('match_day_id', matchDayId)
  if (!kickoffRows?.length) throw new Error('No matches found for match day')
  const earliest = Math.min(
    ...kickoffRows.map((m: { kickoff_time: string }) => new Date(m.kickoff_time).getTime())
  )
  const lockTime = new Date(earliest - 30 * 60 * 1000).toISOString()

  // Publish the match day
  await supabase.from('match_days').update({
    published_at: new Date().toISOString(),
    lock_time: lockTime,
  }).eq('id', matchDayId)

  // Insert pikanteria questions with N options each
  const insertedPika: { id: string; optionIds: string[] }[] = []

  for (let i = 1; i <= 3; i++) {
    const q = (formData.get(`pik_q_${i}`) as string | null)?.trim()
    if (!q) continue

    const count = parseInt(formData.get(`pik_opt_count_${i}`) as string || '0')
    if (count < 2) continue

    const { data: pika } = await supabase
      .from('pikanteria')
      .insert({ question: q, match_day_id: matchDayId })
      .select('id')
      .single()
    if (!pika) continue

    const optionRows = []
    for (let j = 1; j <= count; j++) {
      const label = (formData.get(`pik_opt_label_${i}_${j}`) as string | null)?.trim()
      const odds = parseFloat(formData.get(`pik_opt_odds_${i}_${j}`) as string)
      if (!label || isNaN(odds)) continue
      optionRows.push({ pikanteria_id: pika.id, label, odds, sort_order: j - 1 })
    }

    if (optionRows.length < 2) continue

    const { data: insertedOptions } = await supabase
      .from('pikanteria_options')
      .insert(optionRows)
      .select('id')

    insertedPika.push({ id: pika.id, optionIds: (insertedOptions ?? []).map(o => o.id) })
  }

  // Monkey picks
  const { data: monkey } = await supabase.from('users').select('id').eq('is_monkey', true).single()
  if (monkey) {
    const { data: allMatches } = await supabase
      .from('matches').select('id').eq('match_day_id', matchDayId)
    if (allMatches?.length) {
      await supabase.from('predictions').insert(
        allMatches.map((m: { id: string }) => ({
          user_id: monkey.id, match_id: m.id, pick: monkeyMatchPick(m.id, date),
        }))
      )
    }
    if (insertedPika.length) {
      await supabase.from('pikanteria_answers').insert(
        insertedPika.map(p => ({
          user_id: monkey.id,
          pikanteria_id: p.id,
          option_id: monkeyPikanteriaPick(p.id, date, p.optionIds),
        }))
      )
    }
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

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const selectedDate = date ?? today

  type DraftMatchDay = { id: string; stage: string; date: string }
  type DraftMatch = {
    id: string; home_team: string; away_team: string
    kickoff_time: string; odds_home: number; odds_draw: number; odds_away: number
  }

  let draft: DraftMatchDay | null = null
  let matches: DraftMatch[] = []

  if (date) {
    const supabase = createAdminClient()
    const { data: matchDay } = await supabase
      .from('match_days')
      .select('id, stage, date')
      .eq('date', date)
      .is('published_at', null)
      .maybeSingle()

    if (matchDay) {
      draft = matchDay as DraftMatchDay
      const { data: matchRows } = await supabase
        .from('matches')
        .select('id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away')
        .eq('match_day_id', matchDay.id)
        .order('kickoff_time')
      matches = (matchRows ?? []) as DraftMatch[]
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>📋 Publish Match Day</div>
        <div className="text-muted text-xs">Load a draft day, set odds, and publish</div>
      </div>

      {/* Date picker — GET form loads the draft */}
      <form method="GET" className="rounded-xl p-4 space-y-4"
        style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
          Select Date
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-muted text-xs">Date</label>
            <input type="date" name="date" defaultValue={selectedDate}
              required style={inputBase} className={cls} />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
            Load
          </button>
        </div>
      </form>

      {!date && (
        <div className="text-center py-8 text-muted text-sm">
          Pick a date and click Load to see the scheduled matches
        </div>
      )}

      {date && !draft && (
        <div className="rounded-xl p-4"
          style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-amber)' }}>
            No unpublished draft found for {date}
          </div>
          <div className="text-xs text-muted mt-1">
            The day may already be published, or no fixtures were seeded for this date.
          </div>
        </div>
      )}

      {draft && (
        <form action={publishMatchDay} className="space-y-6">
          <input type="hidden" name="match_day_id" value={draft.id} />
          <input type="hidden" name="date" value={draft.date} />

          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(0,217,126,0.08)', border: '1px solid rgba(0,217,126,0.2)' }}>
            <div className="text-lg">📅</div>
            <div>
              <div className="text-sm font-bold text-text">{draft.date} — {draft.stage}</div>
              <div className="text-xs text-muted">{matches.length} matches loaded from schedule</div>
            </div>
          </div>

          {/* Match cards */}
          {matches.map((match, idx) => {
            const i = idx + 1
            const kickoffLabel = new Date(match.kickoff_time).toLocaleTimeString([], {
              hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
            }) + ' UTC'
            const oddsValue = (k: 'home' | 'draw' | 'away') =>
              k === 'home' ? match.odds_home : k === 'draw' ? match.odds_draw : match.odds_away
            return (
              <div key={match.id} className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <input type="hidden" name={`match_id_${i}`} value={match.id} />
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-text">
                    {match.home_team} vs {match.away_team}
                  </div>
                  <div className="text-xs text-muted">{kickoffLabel}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['home', 'draw', 'away'] as const).map(k => (
                    <div key={k} className="space-y-1">
                      <label className="text-muted text-xs capitalize">Odds {k}</label>
                      <input
                        type="number" step="0.01" name={`odds_${k}_${i}`}
                        required
                        defaultValue={oddsValue(k).toFixed(2)}
                        style={{ ...inputBase, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}
                        className={cls}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

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
              <PicanteriaBuilder questionIndex={i} />
            </div>
          ))}

          <button type="submit" className="w-full py-3 rounded-xl font-black text-sm"
            style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
            🚀 Publish Match Day
          </button>
        </form>
      )}
    </div>
  )
}
