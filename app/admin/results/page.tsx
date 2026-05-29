import { createClient, createServiceClient, assertAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calcMatchPoints, calcPicanteriaPoints } from '@/lib/scoring'
import { snapshotMatchDay } from '@/lib/score-validation'
import type { Stage, Pick, Match, Pikanteria, PicanteriaOption, MatchDay } from '@/lib/types'

type PikanteriaRow = Pikanteria & { pikanteria_options: PicanteriaOption[] }
type MatchDayRow = MatchDay & { matches: Match[]; pikanteria: PikanteriaRow[] }

async function enterResults(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = await createServiceClient()

  const matchDayId = formData.get('match_day_id') as string
  const { data: matchDay } = await supabase
    .from('match_days')
    .select('stage')
    .eq('id', matchDayId)
    .single()

  const stage = matchDay!.stage as Stage

  const { data: matches } = await supabase
    .from('matches')
    .select('id, odds_home, odds_draw, odds_away')
    .eq('match_day_id', matchDayId)

  for (const match of matches ?? []) {
    const result = formData.get(`result_${match.id}`) as Pick | null
    if (!result) continue

    await supabase.from('matches').update({ result }).eq('id', match.id)

    const { data: predictions } = await supabase
      .from('predictions')
      .select('id, pick')
      .eq('match_id', match.id)

    const oddsForResult = result === '1' ? match.odds_home
      : result === 'X' ? match.odds_draw
      : match.odds_away

    for (const pred of predictions ?? []) {
      const points = calcMatchPoints(oddsForResult, stage, pred.pick === result)
      await supabase.from('predictions').update({ points }).eq('id', pred.id)
    }
  }

  // Score pikanteria using n-option structure
  const { data: pikaItems } = await supabase
    .from('pikanteria')
    .select('id, pikanteria_options(id, odds)')
    .eq('match_day_id', matchDayId)

  for (const pika of pikaItems ?? []) {
    const winningOptionId = formData.get(`pik_${pika.id}`) as string | null
    if (!winningOptionId) continue

    // Clear any previously marked correct option before setting the new winner
    await supabase.from('pikanteria_options')
      .update({ is_correct: false })
      .eq('pikanteria_id', pika.id)

    await supabase.from('pikanteria_options')
      .update({ is_correct: true })
      .eq('id', winningOptionId)

    const winningOption = (pika.pikanteria_options as { id: string; odds: number }[])
      .find(o => o.id === winningOptionId)
    if (!winningOption) continue

    const { data: answers } = await supabase
      .from('pikanteria_answers')
      .select('id, option_id')
      .eq('pikanteria_id', pika.id)

    for (const ans of answers ?? []) {
      const points = calcPicanteriaPoints(winningOption.odds, ans.option_id === winningOptionId)
      await supabase.from('pikanteria_answers').update({ points }).eq('id', ans.id)
    }
  }

  await snapshotMatchDay(supabase, matchDayId)

  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/admin/scores')
  redirect('/admin/results')
}

const inputStyle = {
  background: 'var(--color-bg)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--color-text)',
}

export default async function ResultsPage() {
  const supabase = await createClient()

  const { data: matchDays } = await supabase
    .from('match_days')
    .select('*, matches(*), pikanteria(*, pikanteria_options(*))')
    .not('published_at', 'is', null)
    .order('date', { ascending: true })

  const unscoredDays = ((matchDays ?? []) as MatchDayRow[]).filter(d =>
    d.matches.some(m => m.result === null)
  )

  if (unscoredDays.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">✅</div>
        <div className="text-text font-semibold">All match days scored</div>
        <div className="text-muted text-sm mt-1">No pending results to enter</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
          ✅ Enter Results
        </div>
        <div className="text-muted text-xs">{unscoredDays.length} match day{unscoredDays.length > 1 ? 's' : ''} with pending results</div>
      </div>

      {unscoredDays.map(matchDay => {
        const total = matchDay.matches.length
        const done = matchDay.matches.filter(m => m.result !== null).length

        return (
          <div key={matchDay.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-sm text-text">{matchDay.date} · {matchDay.stage}</div>
              </div>
              <div className="rounded-xl px-3 py-1 text-xs font-bold"
                style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)', color: 'var(--color-amber)' }}>
                {done}/{total} scored
              </div>
            </div>

            <form action={enterResults} className="space-y-4">
              <input type="hidden" name="match_day_id" value={matchDay.id} />

              {/* Unscored matches only */}
              {matchDay.matches.filter(m => m.result === null).map(match => (
                <div key={match.id} className="rounded-xl p-4 space-y-3"
                  style={{
                    background: 'var(--color-panel)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-text">
                      {match.home_team} vs {match.away_team}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {[
                      { value: '1', label: `1 — ${match.home_team}` },
                      { value: 'X', label: 'X — Draw' },
                      { value: '2', label: `2 — ${match.away_team}` },
                    ].map(({ value, label }) => (
                      <label key={value}
                        className="flex-1 flex items-center gap-1.5 rounded-lg p-2 cursor-pointer"
                        style={inputStyle}>
                        <input
                          type="radio"
                          name={`result_${match.id}`}
                          value={value}
                        />
                        <span className="text-xs text-text font-medium">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {/* Pikanteria without a correct answer */}
              {matchDay.pikanteria.filter(p => !p.pikanteria_options.some(o => o.is_correct)).length > 0 && (
                <>
                  <div className="font-bold text-xs uppercase tracking-wider mt-2" style={{ color: 'var(--color-amber)' }}>
                    🌶️ Pikanteria Results
                  </div>
                  {matchDay.pikanteria
                    .filter(p => !p.pikanteria_options.some(o => o.is_correct))
                    .map(pika => {
                      const options = [...pika.pikanteria_options].sort(
                        (a, b) => a.sort_order - b.sort_order
                      )
                      return (
                        <div key={pika.id} className="rounded-xl p-4 space-y-3"
                          style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <p className="text-sm font-semibold text-text">{pika.question}</p>
                          <div className="flex gap-2 flex-wrap">
                            {options.map(opt => (
                              <label key={opt.id}
                                className="flex-1 flex items-center gap-1.5 rounded-lg p-2 cursor-pointer min-w-[80px]"
                                style={inputStyle}>
                                <input
                                  type="radio"
                                  name={`pik_${pika.id}`}
                                  value={opt.id}
                                />
                                <span className="text-xs text-text font-medium">{opt.label}</span>
                                <span className="text-[10px] text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                                  {opt.odds.toFixed(2)}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                </>
              )}

              <button type="submit"
                className="w-full py-3 rounded-xl font-black text-sm"
                style={{ background: 'var(--color-accent)', color: '#000' }}>
                ⚡ Submit Results & Score All
              </button>
            </form>

            <hr style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
          </div>
        )
      })}
    </div>
  )
}
