import { createClient, createServiceClient, assertAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { snapshotMatchDay } from '@/lib/score-validation'
import {
  buildMatchScoringPayload,
  buildPikanteriaScoringPayload,
  type ScoredMatchInput,
  type PikanteriaInput,
} from '@/lib/scoring-writes'
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

  // ── Gather the matches being scored from this submission ──────────────────
  const { data: matches } = await supabase
    .from('matches')
    .select('id, odds_home, odds_draw, odds_away')
    .eq('match_day_id', matchDayId)

  const scoredMatches = (matches ?? [])
    .map(m => ({ ...m, result: formData.get(`result_${m.id}`) as Pick | null }))
    .filter((m): m is typeof m & { result: Pick } => m.result !== null)

  // Fetch all predictions for the scored matches in one query, then group.
  const matchIds = scoredMatches.map(m => m.id)
  const { data: predictions } = matchIds.length
    ? await supabase
        .from('predictions')
        .select('id, match_id, pick')
        .in('match_id', matchIds)
    : { data: [] }

  const predsByMatch = new Map<string, { id: string; pick: Pick }[]>()
  for (const p of (predictions ?? []) as { id: string; match_id: string; pick: Pick }[]) {
    const list = predsByMatch.get(p.match_id) ?? []
    list.push({ id: p.id, pick: p.pick })
    predsByMatch.set(p.match_id, list)
  }

  const matchInputs: ScoredMatchInput[] = scoredMatches.map(m => ({
    id: m.id,
    odds_home: m.odds_home,
    odds_draw: m.odds_draw,
    odds_away: m.odds_away,
    result: m.result,
    predictions: predsByMatch.get(m.id) ?? [],
  }))

  const { matchResults, predictionPoints } = buildMatchScoringPayload(matchInputs, stage)

  // ── Gather the pikanteria being resolved from this submission ─────────────
  const { data: pikaItems } = await supabase
    .from('pikanteria')
    .select('id, pikanteria_options(id, odds)')
    .eq('match_day_id', matchDayId)

  const pikInputs: PikanteriaInput[] = []
  for (const pika of pikaItems ?? []) {
    const winningOptionId = formData.get(`pik_${pika.id}`) as string | null
    if (!winningOptionId) continue

    const winningOption = (pika.pikanteria_options as { id: string; odds: number }[])
      .find(o => o.id === winningOptionId)
    if (!winningOption) continue

    pikInputs.push({
      id: pika.id,
      winningOptionId,
      winningOdds: Number(winningOption.odds),
      answers: [],
    })
  }

  const pikIds = pikInputs.map(p => p.id)
  const { data: answers } = pikIds.length
    ? await supabase
        .from('pikanteria_answers')
        .select('id, pikanteria_id, option_id')
        .in('pikanteria_id', pikIds)
    : { data: [] }

  const ansByPik = new Map<string, { id: string; option_id: string }[]>()
  for (const a of (answers ?? []) as { id: string; pikanteria_id: string; option_id: string }[]) {
    const list = ansByPik.get(a.pikanteria_id) ?? []
    list.push({ id: a.id, option_id: a.option_id })
    ansByPik.set(a.pikanteria_id, list)
  }
  for (const input of pikInputs) {
    input.answers = ansByPik.get(input.id) ?? []
  }

  const { winners, answerPoints } = buildPikanteriaScoringPayload(pikInputs)

  // ── Single atomic write: all-or-nothing inside one Postgres transaction ───
  const { error } = await supabase.rpc('enter_match_day_results', {
    p_match_day_id: matchDayId,
    p_match_results: matchResults,
    p_prediction_points: predictionPoints,
    p_pikanteria_winners: winners,
    p_answer_points: answerPoints,
  })
  if (error) {
    // The transaction rolled back; the match day is left exactly as it was.
    throw new Error(`Scoring failed and was rolled back: ${error.message}`)
  }

  // Snapshots are derived/recoverable data (rebuildable via recalculate), so
  // they stay outside the scoring transaction.
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
