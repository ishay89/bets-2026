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
  const date = formData.get('date') as string
  await supabase.from('matches').update({
    odds_home: parseOdds(formData.get('odds_home'), 'odds_home'),
    odds_draw: parseOdds(formData.get('odds_draw'), 'odds_draw'),
    odds_away: parseOdds(formData.get('odds_away'), 'odds_away'),
  }).eq('id', matchId)
  revalidatePath('/predict')
  redirect(`/admin/edit?date=${date}`)
}

async function toggleDayLock(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const locked = formData.get('locked') === 'true'
  await supabase.from('match_days').update({ locked: !locked }).eq('id', matchDayId)
  revalidatePath('/predict')
  const date = formData.get('date') as string
  redirect(`/admin/edit?date=${date}`)
}

async function toggleMatchLock(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const locked = formData.get('locked') === 'true'
  await supabase.from('matches').update({ locked: !locked }).eq('id', matchId)
  revalidatePath('/predict')
  const date = formData.get('date') as string
  redirect(`/admin/edit?date=${date}`)
}

async function editPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const date = formData.get('date') as string
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
  redirect(`/admin/edit?date=${date}`)
}

async function addPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()
  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const date = formData.get('date') as string

  const q = (formData.get('pik_q_1') as string | null)?.trim()
  if (!q) redirect(`/admin/edit?date=${date}`)

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
  if (optionRows.length < 2) redirect(`/admin/edit?date=${date}`)

  // Created as a draft (published_at null) — publish it from the Publish page.
  await supabase.rpc('insert_pikanteria_with_options', {
    p_match_day_id: matchDayId,
    p_question: q,
    p_options: optionRows,
  })

  revalidatePath('/predict')
  redirect(`/admin/edit?date=${date}`)
}

const inputBase = {
  background: 'var(--color-bg)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
}
const cls = 'rounded-lg px-3 py-2 text-sm w-full outline-none focus:ring-1'

export default async function EditPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const supabase = createAdminClient()

  const { data: publishedDays } = await supabase
    .from('match_days')
    .select('id, date, stage')
    .not('published_at', 'is', null)
    .order('date', { ascending: false })

  type PublishedMatchDay = { id: string; stage: string; date: string; lock_time: string; locked: boolean }
  type PublishedMatch = {
    id: string; home_team: string; away_team: string
    kickoff_time: string; odds_home: number; odds_draw: number; odds_away: number
    result: string | null; locked: boolean; published_at: string | null
  }
  type EditPika = {
    id: string; question: string; published_at: string | null
    pikanteria_options: { id: string; label: string; odds: number; sort_order: number; is_correct: boolean }[]
  }

  let matchDay: PublishedMatchDay | null = null
  let matches: PublishedMatch[] = []
  let pikanteria: EditPika[] = []

  if (date) {
    const { data: md } = await supabase
      .from('match_days')
      .select('id, stage, date, lock_time, locked')
      .eq('date', date)
      .not('published_at', 'is', null)
      .maybeSingle()

    if (md) {
      matchDay = md as PublishedMatchDay
      const [{ data: matchRows }, { data: pikaRows }] = await Promise.all([
        supabase
          .from('matches')
          .select('id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away, result, locked, published_at')
          .eq('match_day_id', md.id)
          .order('kickoff_time'),
        supabase
          .from('pikanteria')
          .select('id, question, published_at, pikanteria_options(id, label, odds, sort_order, is_correct)')
          .eq('match_day_id', md.id)
          .order('created_at'),
      ])
      matches = (matchRows ?? []) as PublishedMatch[]
      pikanteria = (pikaRows ?? []) as EditPika[]
    }
  }

  const hasScored = matches.some(m => m.result !== null)

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>✏️ Edit Published Match Day</div>
        <div className="text-muted text-xs">Update individual match odds, edit pikanteria, or lock predictions</div>
      </div>

      {/* Date select — GET form */}
      <form method="GET" className="rounded-xl p-4 space-y-4"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
        <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
          Select Date
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-muted text-xs">Published Match Day</label>
            <select name="date" defaultValue={date ?? ''} style={inputBase} className={cls}>
              <option value="">— pick a date —</option>
              {(publishedDays ?? []).map(d => (
                <option key={d.id} value={d.date}>{d.date} · {d.stage}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
            Load
          </button>
        </div>
      </form>

      {date && !matchDay && (
        <div className="rounded-xl p-4"
          style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-amber)' }}>
            No published match day found for {date}
          </div>
        </div>
      )}

      {hasScored && (
        <div className="rounded-xl p-4"
          style={{ background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
          <div className="text-[11px] font-semibold" style={{ color: 'var(--color-danger)' }}>
            ⚠️ Some matches are already scored. Changing odds will not recalculate existing points — go to Results to re-score.
          </div>
        </div>
      )}

      {matchDay && (
        <>
          {/* Day-level lock toggle */}
          <form action={toggleDayLock} className="rounded-xl p-4 flex items-center justify-between"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <input type="hidden" name="match_day_id" value={matchDay.id} />
            <input type="hidden" name="date" value={matchDay.date} />
            <input type="hidden" name="locked" value={String(matchDay.locked)} />
            <div>
              <div className="text-sm font-bold text-text">Day lock</div>
              <div className="text-xs text-muted">Locks all matches and pikanteria for this day</div>
            </div>
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold"
              style={{
                background: matchDay.locked ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
                color: matchDay.locked ? 'var(--color-accent)' : 'var(--color-danger)',
                border: `1px solid ${matchDay.locked ? 'var(--border-accent)' : 'var(--border-danger)'}`,
              }}>
              {matchDay.locked ? '🔓 Unlock Day' : '🔒 Lock Day'}
            </button>
          </form>

          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>
            <div className="text-lg">📅</div>
            <div>
              <div className="text-sm font-bold text-text">{matchDay.date} · {matchDay.stage}</div>
              <div className="text-xs text-muted">{matches.length} matches loaded</div>
            </div>
          </div>

          {/* Per-match odds save + per-match lock */}
          {matches.map(match => {
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
                    {match.result && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>
                        ✓ {match.result}
                      </span>
                    )}
                    <span className="text-xs text-muted">{kickoffLabel}</span>
                  </div>
                </div>

                <form action={saveMatchOdds} className="space-y-3">
                  <input type="hidden" name="match_id" value={match.id} />
                  <input type="hidden" name="date" value={matchDay!.date} />
                  <div className="grid grid-cols-3 gap-2">
                    {(['home', 'draw', 'away'] as const).map(k => (
                      <div key={k} className="space-y-1">
                        <label className="text-muted text-xs capitalize">Odds {k}</label>
                        <input type="number" step="0.01" name={`odds_${k}`} required
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
                  <input type="hidden" name="date" value={matchDay!.date} />
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

          {/* Edit existing pikanteria */}
          {pikanteria.length > 0 && (
            <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
              🌶️ Edit pikanteria
            </div>
          )}
          {pikanteria.map(pika => {
            const options = [...pika.pikanteria_options].sort((a, b) => a.sort_order - b.sort_order)
            const resolved = options.some(o => o.is_correct)
            return (
              <form key={pika.id} action={editPikanteria} className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                <input type="hidden" name="pikanteria_id" value={pika.id} />
                <input type="hidden" name="date" value={matchDay!.date} />
                <input type="hidden" name="opt_count" value={options.length} />
                <div className="flex items-center gap-2">
                  {pika.published_at == null && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: 'var(--color-muted)', border: '1px solid var(--border-base)' }}>○ Draft</span>
                  )}
                  {resolved && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>✓ scored</span>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-muted text-xs">Question</label>
                  <input type="text" name="question" defaultValue={pika.question} style={inputBase} className={cls} />
                </div>
                <div className="space-y-2">
                  {options.map((opt, idx) => {
                    const k = idx + 1
                    return (
                      <div key={opt.id} className="flex gap-2 items-center">
                        <input type="hidden" name={`opt_id_${k}`} value={opt.id} />
                        <input type="text" name={`opt_label_${k}`} defaultValue={opt.label}
                          style={inputBase} className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 flex-1" />
                        <input type="number" step="0.01" name={`opt_odds_${k}`} defaultValue={opt.odds.toFixed(2)}
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
            )
          })}

          {/* Add a new pikanteria (created as draft — publish it on the Publish page) */}
          <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
            Add a pikanteria question (draft)
          </div>
          <form action={addPikanteria} className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <input type="hidden" name="match_day_id" value={matchDay.id} />
            <input type="hidden" name="date" value={matchDay.date} />
            <div className="space-y-1">
              <label className="text-muted text-xs">Question</label>
              <input type="text" name="pik_q_1" placeholder="e.g. Will Mbappé score?" style={inputBase} className={cls} />
            </div>
            <PicanteriaBuilder questionIndex={1} />
            <button type="submit" className="w-full py-2 rounded-lg font-bold text-sm"
              style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
              ➕ Add question (draft)
            </button>
          </form>
        </>
      )}
    </div>
  )
}
