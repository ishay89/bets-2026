import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calcMatchPoints, calcPicanteriaPoints } from '@/lib/scoring'
import { snapshotMatchDay } from '@/lib/score-validation'
import type { Stage, Pick } from '@/lib/types'

async function enterResults(formData: FormData) {
  'use server'
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

  const { data: pikaItems } = await supabase
    .from('pikanteria')
    .select('id, odds_yes, odds_no')
    .eq('match_day_id', matchDayId)

  for (const pika of pikaItems ?? []) {
    const resultStr = formData.get(`pik_${pika.id}`)
    if (resultStr === null) continue
    const result = resultStr === 'true'

    await supabase.from('pikanteria').update({ result }).eq('id', pika.id)

    const { data: answers } = await supabase
      .from('pikanteria_answers')
      .select('id, answer')
      .eq('pikanteria_id', pika.id)

    const oddsForResult = result ? pika.odds_yes : pika.odds_no

    for (const ans of answers ?? []) {
      const points = calcPicanteriaPoints(oddsForResult, ans.answer === result)
      await supabase.from('pikanteria_answers').update({ points }).eq('id', ans.id)
    }
  }

  await snapshotMatchDay(supabase, matchDayId)

  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/admin/scores')
  redirect('/admin')
}

export default async function ResultsPage() {
  const supabase = await createClient()

  // Get most recent published match day that still has unscored matches
  const { data: matchDays } = await supabase
    .from('match_days')
    .select('*, matches(*), pikanteria(*)')
    .not('published_at', 'is', null)
    .order('date', { ascending: false })
    .limit(5)

  // Find first day with at least one unscored match
  const matchDay = (matchDays ?? []).find((d: any) =>
    d.matches.some((m: any) => m.result === null)
  ) ?? matchDays?.[0]

  const inputStyle = {
    background: 'var(--color-bg)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--color-text)',
  }

  if (!matchDay) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">✅</div>
        <div className="text-text font-semibold">All match days scored</div>
        <div className="text-muted text-sm mt-1">No pending results to enter</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
          ✅ Enter Results
        </div>
        <div className="text-muted text-xs">{matchDay.date} · {matchDay.stage}</div>
      </div>

      {/* Status */}
      {(() => {
        const total = (matchDay.matches as any[]).length
        const done = (matchDay.matches as any[]).filter((m: any) => m.result !== null).length
        return (
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)' }}>
            <div className="text-lg">⏳</div>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-amber)' }}>
                {done} of {total} matches scored
              </div>
              <div className="text-xs text-muted">Submit to update leaderboard</div>
            </div>
          </div>
        )
      })()}

      <form action={enterResults} className="space-y-4">
        <input type="hidden" name="match_day_id" value={matchDay.id} />

        {/* Matches */}
        {(matchDay.matches as any[]).map((match: any) => (
          <div key={match.id} className="rounded-xl p-4 space-y-3"
            style={{
              background: 'var(--color-panel)',
              border: `1px solid ${match.result ? 'rgba(0,217,126,0.3)' : 'rgba(255,255,255,0.06)'}`,
            }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-text">
                {match.home_team} vs {match.away_team}
              </span>
              {match.result && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-line)' }}>
                  ✓ {match.result} scored
                </span>
              )}
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
                    defaultChecked={match.result === value}
                  />
                  <span className="text-xs text-text font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Pikanteria */}
        {(matchDay.pikanteria as any[]).length > 0 && (
          <>
            <div className="font-bold text-xs uppercase tracking-wider mt-2" style={{ color: 'var(--color-amber)' }}>
              🌶️ Pikanteria Results
            </div>
            {(matchDay.pikanteria as any[]).map((pika: any) => (
              <div key={pika.id} className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-sm font-semibold text-text">{pika.question}</p>
                <div className="flex gap-2">
                  {[
                    { value: 'true', label: 'Yes / Over' },
                    { value: 'false', label: 'No / Under' },
                  ].map(({ value, label }) => (
                    <label key={value}
                      className="flex-1 flex items-center gap-1.5 rounded-lg p-2 cursor-pointer"
                      style={inputStyle}>
                      <input
                        type="radio"
                        name={`pik_${pika.id}`}
                        value={value}
                        defaultChecked={pika.result !== null && String(pika.result) === value}
                      />
                      <span className="text-xs font-medium" style={{ color: 'var(--color-amber)' }}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <button type="submit"
          className="w-full py-3 rounded-xl font-black text-sm"
          style={{ background: 'var(--color-accent)', color: '#000' }}>
          ⚡ Submit Results & Score All
        </button>
      </form>
    </div>
  )
}
