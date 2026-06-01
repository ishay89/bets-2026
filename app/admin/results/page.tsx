import { createClient, createServiceClient, assertAdmin } from '@/lib/supabase/server'
import { getPublishedMatchDaysWithAll } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { snapshotMatchDay } from '@/lib/score-validation'
import {
  buildMatchScoringPayload,
  buildPikanteriaScoringPayload,
  type ScoredMatchInput,
  type PikanteriaInput,
  type MatchResultWrite,
  type PikanteriaWinnerWrite,
  type PointsWrite,
} from '@/lib/scoring-writes'
import type { Stage, Pick, Match, Pikanteria, PicanteriaOption, MatchDay } from '@/lib/types'
import { parseUUID, parsePick } from '@/lib/validation'

type PikanteriaRow = Pikanteria & { pikanteria_options: PicanteriaOption[] }
type MatchDayRow = MatchDay & { matches: Match[]; pikanteria: PikanteriaRow[] }

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

// Shared scoring core: score any subset of a day's matches/pikanteria in one
// atomic RPC, then refresh the day's snapshot. Reused by the per-item buttons
// and the day-wide "Score All". The RPC's whole-day invariants stay satisfied
// for partial scoring — already-scored items keep their points, and unscored
// items have result IS NULL so they're excluded from the checks.
async function scoreItems(
  supabase: ServiceClient,
  matchDayId: string,
  scoredMatches: { matchId: string; result: Pick }[],
  resolvedPikas: { pikanteriaId: string; optionId: string }[],
) {
  const { data: matchDay, error: matchDayError } = await supabase
    .from('match_days')
    .select('stage')
    .eq('id', matchDayId)
    .single()
  if (matchDayError) throw matchDayError
  if (!matchDay) throw new Error('Match day not found')
  const stage = matchDay.stage as Stage

  let matchResults: MatchResultWrite[] = []
  let predictionPoints: PointsWrite[] = []

  if (scoredMatches.length) {
    const matchIds = scoredMatches.map(m => m.matchId)
    const resultById = new Map(scoredMatches.map(m => [m.matchId, m.result]))

    const { data: matchRows, error: matchesError } = await supabase
      .from('matches')
      .select('id, odds_home, odds_draw, odds_away')
      .eq('match_day_id', matchDayId)
      .in('id', matchIds)
    if (matchesError) throw matchesError

    const { data: predictions, error: predsError } = await supabase
      .from('predictions')
      .select('id, match_id, pick')
      .in('match_id', matchIds)
    if (predsError) throw predsError

    const predsByMatch = new Map<string, { id: string; pick: Pick }[]>()
    for (const p of (predictions ?? []) as { id: string; match_id: string; pick: Pick }[]) {
      const list = predsByMatch.get(p.match_id) ?? []
      list.push({ id: p.id, pick: p.pick })
      predsByMatch.set(p.match_id, list)
    }

    const matchInputs: ScoredMatchInput[] = (matchRows ?? []).map(m => ({
      id: m.id,
      odds_home: m.odds_home,
      odds_draw: m.odds_draw,
      odds_away: m.odds_away,
      result: resultById.get(m.id)!,
      predictions: predsByMatch.get(m.id) ?? [],
    }))

    ;({ matchResults, predictionPoints } = buildMatchScoringPayload(matchInputs, stage))
  }

  let winners: PikanteriaWinnerWrite[] = []
  let answerPoints: PointsWrite[] = []

  if (resolvedPikas.length) {
    const pikIds = resolvedPikas.map(p => p.pikanteriaId)
    const optionById = new Map(resolvedPikas.map(p => [p.pikanteriaId, p.optionId]))

    const { data: pikaItems, error: pikaError } = await supabase
      .from('pikanteria')
      .select('id, pikanteria_options(id, odds)')
      .eq('match_day_id', matchDayId)
      .in('id', pikIds)
    if (pikaError) throw pikaError

    const pikInputs: PikanteriaInput[] = []
    for (const pika of pikaItems ?? []) {
      const winningOptionId = optionById.get(pika.id)
      if (!winningOptionId) continue
      const winningOption = (pika.pikanteria_options as { id: string; odds: number }[])
        .find(o => o.id === winningOptionId)
      if (!winningOption) continue
      pikInputs.push({ id: pika.id, winningOptionId, winningOdds: Number(winningOption.odds), answers: [] })
    }

    const answeredIds = pikInputs.map(p => p.id)
    const { data: answers, error: answersError } = answeredIds.length
      ? await supabase
          .from('pikanteria_answers')
          .select('id, pikanteria_id, option_id')
          .in('pikanteria_id', answeredIds)
      : { data: [], error: null }
    if (answersError) throw answersError

    const ansByPik = new Map<string, { id: string; option_id: string }[]>()
    for (const a of (answers ?? []) as { id: string; pikanteria_id: string; option_id: string }[]) {
      const list = ansByPik.get(a.pikanteria_id) ?? []
      list.push({ id: a.id, option_id: a.option_id })
      ansByPik.set(a.pikanteria_id, list)
    }
    for (const input of pikInputs) {
      input.answers = ansByPik.get(input.id) ?? []
    }

    ;({ winners, answerPoints } = buildPikanteriaScoringPayload(pikInputs))
  }

  // Single atomic write: all-or-nothing inside one Postgres transaction.
  const { error } = await supabase.rpc('enter_match_day_results', {
    p_match_day_id: matchDayId,
    p_match_results: matchResults,
    p_prediction_points: predictionPoints,
    p_pikanteria_winners: winners,
    p_answer_points: answerPoints,
  })
  if (error) {
    throw new Error(`Scoring failed and was rolled back: ${error.message}`)
  }

  // Snapshots are derived/recoverable, so they stay outside the scoring txn.
  await snapshotMatchDay(supabase, matchDayId)

  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/admin/scores')
}

async function scoreMatch(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = await createServiceClient()
  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const result = parsePick(formData.get(`result_${matchId}`), `match ${matchId}`)
  await scoreItems(supabase, matchDayId, [{ matchId, result }], [])
  redirect('/admin/results')
}

async function scorePikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = await createServiceClient()
  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const optionId = parseUUID(formData.get(`pik_${pikanteriaId}`), `pikanteria option for ${pikanteriaId}`)
  await scoreItems(supabase, matchDayId, [], [{ pikanteriaId, optionId }])
  redirect('/admin/results')
}

async function resetMatch(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = await createServiceClient()
  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const matchId = parseUUID(formData.get('match_id'), 'match_id')

  const { error: matchError } = await supabase
    .from('matches')
    .update({ result: null })
    .eq('id', matchId)
  if (matchError) throw matchError

  const { error: predsError } = await supabase
    .from('predictions')
    .update({ points: null })
    .eq('match_id', matchId)
  if (predsError) throw predsError

  await snapshotMatchDay(supabase, matchDayId)

  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/admin/scores')
  redirect('/admin/results')
}


const inputStyle = {
  background: 'var(--color-bg)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
}

const scoreBtn = 'px-3 py-1.5 rounded-lg text-xs font-bold'
const scoreBtnStyle = { background: 'var(--color-accent)', color: '#000' }

export default async function ResultsPage() {
  const supabase = await createClient()

  const matchDays = await getPublishedMatchDaysWithAll(supabase)

  const daysWithContent = (matchDays as MatchDayRow[]).filter(d =>
    d.matches.length > 0 || d.pikanteria.length > 0
  )

  if (daysWithContent.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">📋</div>
        <div className="text-text font-semibold">No match days published yet</div>
        <div className="text-muted text-sm mt-1">Publish match days to enter results</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
          ✅ Enter Results
        </div>
        <div className="text-muted text-xs">
          Score or update individual matches and pikanteria below
        </div>
      </div>

      {daysWithContent.map(matchDay => {
        const total = matchDay.matches.length
        const done = matchDay.matches.filter(m => m.result !== null).length
        // Sort all matches: later kickoff first so most-recent games are at the top
        const sortedMatches = [...matchDay.matches].sort(
          (a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime()
        )
        const sortedPikas = matchDay.pikanteria

        return (
          <div key={matchDay.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm text-text">{matchDay.date} · {matchDay.stage}</div>
              <div className="rounded-xl px-3 py-1 text-xs font-bold"
                style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)', color: 'var(--color-amber)' }}>
                {done}/{total} scored
              </div>
            </div>

            {/* Per-match scoring — each its own form */}
            {sortedMatches.map(match => (
              <form key={match.id} action={scoreMatch} className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                <input type="hidden" name="match_day_id" value={matchDay.id} />
                <input type="hidden" name="match_id" value={match.id} />
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-text">{match.home_team} vs {match.away_team}</div>
                  {match.result && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--border-accent)' }}>
                      ✓ {match.result}
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
                      <input type="radio" name={`result_${match.id}`} value={value} required
                        defaultChecked={match.result === value} />
                      <span className="text-xs text-text font-medium">{label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="submit" className={`${scoreBtn} py-2`} style={{ ...scoreBtnStyle, flex: 1 }}>
                    {match.result ? '✏️ Update result' : '⚡ Score this match'}
                  </button>
                  {match.result && (
                    <button
                      formAction={resetMatch}
                      className={`${scoreBtn} py-2 px-4`}
                      style={{ background: 'var(--color-danger)', color: '#fff' }}
                    >
                      ↺ Reset
                    </button>
                  )}
                </div>
              </form>
            ))}

            {/* Per-pikanteria scoring — each its own form */}
            {sortedPikas.length > 0 && (
              <div className="font-bold text-xs uppercase tracking-wider mt-2" style={{ color: 'var(--color-amber)' }}>
                🌶️ Pikanteria Results
              </div>
            )}
            {sortedPikas.map(pika => {
              const options = [...pika.pikanteria_options].sort((a, b) => a.sort_order - b.sort_order)
              const correctOption = options.find(o => o.is_correct)
              return (
                <form key={pika.id} action={scorePikanteria} className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                  <input type="hidden" name="match_day_id" value={matchDay.id} />
                  <input type="hidden" name="pikanteria_id" value={pika.id} />
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text">{pika.question}</p>
                    {correctOption && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--border-accent)' }}>
                        ✓ {correctOption.label}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {options.map(opt => (
                      <label key={opt.id}
                        className="flex-1 flex items-center gap-1.5 rounded-lg p-2 cursor-pointer min-w-[80px]"
                        style={inputStyle}>
                        <input type="radio" name={`pik_${pika.id}`} value={opt.id} required
                          defaultChecked={opt.is_correct} />
                        <span className="text-xs text-text font-medium">{opt.label}</span>
                        <span className="text-[10px] text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                          {opt.odds.toFixed(2)}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button type="submit" className={`${scoreBtn} w-full py-2`} style={scoreBtnStyle}>
                    {correctOption ? '✏️ Update answer' : '⚡ Score this question'}
                  </button>
                </form>
              )
            })}

            <hr style={{ borderColor: 'var(--border-base)' }} />
          </div>
        )
      })}
    </div>
  )
}
