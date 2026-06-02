import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { parseUUID, parseOdds, parseNonEmpty } from '@/lib/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { PicanteriaBuilder } from '@/components/pikanteria-builder'

async function saveMatchOdds(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  await supabase.from('matches').update({
    odds_home: parseOdds(formData.get('odds_home'), 'odds_home'),
    odds_draw: parseOdds(formData.get('odds_draw'), 'odds_draw'),
    odds_away: parseOdds(formData.get('odds_away'), 'odds_away'),
  }).eq('id', matchId)
  revalidatePath('/predict')
  redirect('/admin/edit')
}

async function toggleFuturesLock(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const locked = formData.get('futures_locked') === 'true'
  await supabase.from('tournament_settings').update({ futures_locked: !locked }).eq('id', true)
  revalidatePath('/predict')
  redirect('/admin/edit')
}

async function toggleMatchLock(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const locked = formData.get('locked') === 'true'
  await supabase.from('matches').update({ locked: !locked }).eq('id', matchId)
  revalidatePath('/predict')
  redirect('/admin/edit')
}

async function togglePikanteriaLock(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const locked = formData.get('locked') === 'true'
  await supabase.from('pikanteria').update({ locked: !locked }).eq('id', pikanteriaId)
  revalidatePath('/predict')
  redirect('/admin/edit')
}

async function editPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const question = parseNonEmpty(formData.get('question'), 'question')

  const count = parseInt((formData.get('opt_count') as string) || '0')
  const options: { id: string; label: string; odds: number; sort_order: number }[] = []
  for (let k = 1; k <= count; k++) {
    const id = parseUUID(formData.get(`opt_id_${k}`), `opt_id_${k}`)
    const label = parseNonEmpty(formData.get(`opt_label_${k}`), `opt_label_${k}`)
    const odds = parseOdds(formData.get(`opt_odds_${k}`), `opt_odds_${k}`)
    options.push({ id, label, odds, sort_order: k - 1 })
  }

  const { error } = await supabase.rpc('update_pikanteria_with_options', {
    p_pikanteria_id: pikanteriaId,
    p_question: question,
    p_options: options,
  })
  if (error) throw new Error(`Failed to update pikanteria: ${error.message}`)

  revalidatePath('/predict')
  redirect('/admin/edit')
}

async function addPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')

  const q = (formData.get('pik_q_1') as string | null)?.trim()
  if (!q) redirect('/admin/edit')

  const count = parseInt((formData.get('pik_opt_count_1') as string) || '0')
  const optionRows: { label: string; odds: number; sort_order: number }[] = []
  for (let j = 1; j <= count; j++) {
    const label = (formData.get(`pik_opt_label_1_${j}`) as string | null)?.trim()
    if (!label) continue
    let odds: number
    try {
      odds = parseOdds(formData.get(`pik_opt_odds_1_${j}`), `pik_opt_odds_1_${j}`)
    } catch {
      continue
    }
    optionRows.push({ label, odds, sort_order: j - 1 })
  }
  if (optionRows.length < 2) redirect('/admin/edit')

  await supabase.rpc('insert_pikanteria_with_options', {
    p_match_day_id: matchDayId,
    p_question: q,
    p_options: optionRows,
  })

  revalidatePath('/predict')
  redirect('/admin/edit')
}

const inputBase = {
  background: 'var(--color-bg)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
}
const cls = 'rounded-lg px-3 py-2 text-sm w-full outline-none focus:ring-1'


export default async function EditPage() {
  const supabase = createAdminClient()

  const [{ data: settings }, { data: days }] = await Promise.all([
    supabase.from('tournament_settings').select('futures_locked').eq('id', true).single(),
    supabase
      .from('match_days')
      .select(`
        id, stage, date,
        matches!inner(id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away, result, locked, published_at),
        pikanteria(id, question, locked, published_at, pikanteria_options(id, label, odds, sort_order, is_correct))
      `)
      .not('matches.published_at', 'is', null)
      .is('matches.result', null)
      .order('date')
      .order('kickoff_time', { referencedTable: 'matches' }),
  ])

  const futuresLocked = settings?.futures_locked ?? false

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>✏️ Edit Published Matches</div>
        <div className="text-muted text-xs">Published matches with no result and predictions still open</div>
      </div>

      {/* Futures lock toggle */}
      <div className="rounded-xl p-3 flex items-center justify-between"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
        <div className="flex items-center gap-3">
          <div className="text-lg">🏆</div>
          <div>
            <div className="text-sm font-bold text-text">Winner &amp; Top Scorer</div>
            <div className="text-xs text-muted">
              {futuresLocked
                ? 'Manually locked - users cannot change picks'
                : 'Open - users can change picks until you lock futures'}
            </div>
          </div>
        </div>
        <form action={toggleFuturesLock}>
          <input type="hidden" name="futures_locked" value={String(futuresLocked)} />
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold"
            style={{
              background: futuresLocked ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
              color: futuresLocked ? 'var(--color-accent)' : 'var(--color-danger)',
              border: `1px solid ${futuresLocked ? 'var(--border-accent)' : 'var(--border-danger)'}`,
            }}>
            {futuresLocked ? '🔓 Unlock Futures' : '🔒 Lock Futures'}
          </button>
        </form>
      </div>

      {(days ?? []).length === 0 && (
        <div className="rounded-xl p-4"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          <div className="text-sm text-muted text-center">No actionable matches - all published matches are already scored.</div>
        </div>
      )}

      {(days ?? []).map((day) => {
        const dayPikanteria = (day.pikanteria ?? []).filter(p => !(p.pikanteria_options ?? []).some(o => o.is_correct))
        return (
          <div key={day.id} className="space-y-4">
            {/* Day header */}
            <div className="rounded-xl p-3 flex items-center justify-between"
              style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>
              <div className="flex items-center gap-3">
                <div className="text-lg">📅</div>
                <div>
                  <div className="text-sm font-bold text-text">{day.date} · {day.stage}</div>
                  <div className="text-xs text-muted">{day.matches.length} match{day.matches.length !== 1 ? 'es' : ''}</div>
                </div>
              </div>
            </div>

            {/* Per-match odds + lock */}
            {day.matches.map(match => {
              const kickoffLabel = new Date(match.kickoff_time).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
              }) + ' UTC'
              return (
                <div key={match.id} className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm text-text">{match.home_team} vs {match.away_team}</div>
                    <div className="flex items-center gap-2">
                      {match.published_at == null && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ color: 'var(--color-muted)', border: '1px solid var(--border-base)' }}>
                          ○ Draft
                        </span>
                      )}
                      <span className="text-xs text-muted">{kickoffLabel}</span>
                    </div>
                  </div>

                  <form action={saveMatchOdds} className="space-y-3">
                    <input type="hidden" name="match_id" value={match.id} />
                    <div className="grid grid-cols-3 gap-2">
                      {(['home', 'draw', 'away'] as const).map(k => (
                        <div key={k} className="space-y-1">
                          <label htmlFor={`odds_${k}_${match.id}`} className="text-muted text-xs capitalize">Odds {k}</label>
                          <input type="number" step="0.01" name={`odds_${k}`} required
                            id={`odds_${k}_${match.id}`}
                            aria-label={`Odds ${k}`}
                            defaultValue={(k === 'home' ? match.odds_home : k === 'draw' ? match.odds_draw : match.odds_away).toFixed(2)}
                            style={{ ...inputBase, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}
                            className={cls} />
                        </div>
                      ))}
                    </div>
                    <button type="submit" className="w-full py-2 rounded-lg font-bold text-sm"
                      style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
                      💾 Save odds
                    </button>
                  </form>

                  <form action={toggleMatchLock} className="flex items-center justify-between pt-1">
                    <input type="hidden" name="match_id" value={match.id} />
                    <input type="hidden" name="locked" value={String(match.locked)} />
                    <span className="text-xs text-muted">Per-match lock</span>
                    <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{
                        background: match.locked ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
                        color: match.locked ? 'var(--color-accent)' : 'var(--color-danger)',
                        border: `1px solid ${match.locked ? 'var(--border-accent)' : 'var(--border-danger)'}`,
                      }}>
                      {match.locked ? '🔓 Unlock' : '🔒 Lock'}
                    </button>
                  </form>
                </div>
              )
            })}

            {/* Unresolved pikanteria for this day */}
            {dayPikanteria.length > 0 && (
              <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
                🌶️ Edit pikanteria
              </div>
            )}
            {dayPikanteria.map(pika => {
              const options = pika.pikanteria_options.toSorted((a, b) => a.sort_order - b.sort_order)
              return (
                <div key={pika.id} className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                  <div className="flex items-center justify-between gap-2">
                    {pika.published_at == null && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ color: 'var(--color-muted)', border: '1px solid var(--border-base)' }}>○ Draft</span>
                    )}
                    <form action={togglePikanteriaLock} className="ml-auto">
                      <input type="hidden" name="pikanteria_id" value={pika.id} />
                      <input type="hidden" name="locked" value={String(pika.locked)} />
                      <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{
                          background: pika.locked ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
                          color: pika.locked ? 'var(--color-accent)' : 'var(--color-danger)',
                          border: `1px solid ${pika.locked ? 'var(--border-accent)' : 'var(--border-danger)'}`,
                        }}>
                        {pika.locked ? '🔓 Unlock' : '🔒 Lock'}
                      </button>
                    </form>
                  </div>
                  <form action={editPikanteria} className="space-y-3">
                    <input type="hidden" name="pikanteria_id" value={pika.id} />
                    <input type="hidden" name="opt_count" value={options.length} />
                    <div className="space-y-1">
                      <label htmlFor={`pika_question_${pika.id}`} className="text-muted text-xs">Question</label>
                      <input type="text" id={`pika_question_${pika.id}`} aria-label="Question" name="question" defaultValue={pika.question} style={inputBase} className={cls} />
                    </div>
                    <div className="space-y-2">
                      {options.map((opt, idx) => {
                        const k = idx + 1
                        return (
                          <div key={opt.id} className="flex gap-2 items-center">
                            <input type="hidden" name={`opt_id_${k}`} value={opt.id} />
                            <input type="text" name={`opt_label_${k}`} defaultValue={opt.label}
                              aria-label={`Option ${k} label`}
                              style={inputBase} className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 flex-1" />
                            <input type="number" step="0.01" name={`opt_odds_${k}`} defaultValue={opt.odds.toFixed(2)}
                              aria-label={`Option ${k} odds`}
                              style={{ ...inputBase, color: 'var(--color-amber)', fontFamily: 'var(--font-mono)' }}
                              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 w-24" />
                          </div>
                        )
                      })}
                    </div>
                    <button type="submit" className="w-full py-2 rounded-lg font-bold text-sm"
                      style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
                      💾 Save question
                    </button>
                  </form>
                </div>
              )
            })}

            {/* Add new pikanteria (draft) */}
            <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
              Add a pikanteria question (draft)
            </div>
            <form action={addPikanteria} className="rounded-xl p-4 space-y-3"
              style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
              <input type="hidden" name="match_day_id" value={day.id} />
              <div className="space-y-1">
                <label htmlFor={`pik_q_1_${day.id}`} className="text-muted text-xs">Question</label>
                <input type="text" id={`pik_q_1_${day.id}`} aria-label="Question" name="pik_q_1" placeholder="e.g. Will Mbappé score?" style={inputBase} className={cls} />
              </div>
              <PicanteriaBuilder questionIndex={1} />
              <button type="submit" className="w-full py-2 rounded-lg font-bold text-sm"
                style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
                ➕ Add question (draft)
              </button>
            </form>
          </div>
        )
      })}
    </div>
  )
}
