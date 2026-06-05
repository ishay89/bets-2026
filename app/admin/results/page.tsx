import { createClient, createServiceClient, assertAdmin } from '@/lib/supabase/server'
import { getPublishedMatchDaysWithAll } from '@/lib/data'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { snapshotMatchDay } from '@/lib/score-validation'
import {
  buildMatchScoringPayload,
  buildPikanteriaScoringPayload,
  type ScoredMatchInput,
  type ScoredPikanteriaInput,
  type MatchResultWrite,
  type PikanteriaResultWrite,
  type PointsWrite,
} from '@/lib/scoring-writes'
import type { Pick, Match, Pikanteria, MatchDay } from '@/lib/types'
import { parseUUID, parsePick } from '@/lib/validation'

type MatchDayRow = MatchDay & { matches: Match[]; pikanteria: Pikanteria[] }

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
  resolvedPikas: { pikanteriaId: string; result: Pick }[],
) {
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

    ;({ matchResults, predictionPoints } = buildMatchScoringPayload(matchInputs))
  }

  let pikanteriaResults: PikanteriaResultWrite[] = []
  let answerPoints: PointsWrite[] = []

  if (resolvedPikas.length) {
    const pikIds = resolvedPikas.map(p => p.pikanteriaId)
    const resultById = new Map(resolvedPikas.map(p => [p.pikanteriaId, p.result]))

    const { data: pikaItems, error: pikaError } = await supabase
      .from('pikanteria')
      .select('id, odds_1, odds_2, odds_x')
      .eq('match_day_id', matchDayId)
      .in('id', pikIds)
    if (pikaError) throw pikaError

    const { data: answers, error: answersError } = await supabase
      .from('pikanteria_answers')
      .select('id, pikanteria_id, pick')
      .in('pikanteria_id', pikIds)
    if (answersError) throw answersError

    const ansByPik = new Map<string, { id: string; pick: Pick }[]>()
    for (const a of (answers ?? []) as { id: string; pikanteria_id: string; pick: Pick }[]) {
      const list = ansByPik.get(a.pikanteria_id) ?? []
      list.push({ id: a.id, pick: a.pick })
      ansByPik.set(a.pikanteria_id, list)
    }

    const pikInputs: ScoredPikanteriaInput[] = (pikaItems ?? []).map(pika => ({
      id: pika.id,
      odds_1: Number(pika.odds_1),
      odds_2: Number(pika.odds_2),
      odds_x: pika.odds_x == null ? null : Number(pika.odds_x),
      result: resultById.get(pika.id)!,
      answers: ansByPik.get(pika.id) ?? [],
    }))

    ;({ pikanteriaResults, answerPoints } = buildPikanteriaScoringPayload(pikInputs))
  }

  // Single atomic write: all-or-nothing inside one Postgres transaction.
  const { error } = await supabase.rpc('enter_match_day_results', {
    p_match_day_id: matchDayId,
    p_match_results: matchResults,
    p_prediction_points: predictionPoints,
    p_pikanteria_results: pikanteriaResults,
    p_answer_points: answerPoints,
  })
  if (error) {
    throw new Error(`Scoring failed and was rolled back: ${error.message}`)
  }

  // Scoring closes the bet, so lock each item we just scored. Locking is what
  // reveals the crowd aggregate (crowd_match_picks / crowd_pikanteria_picks) and
  // the individual picks (the per-item read RLS on predictions/pikanteria_answers
  // both open up once the item is locked), so this is also the reveal step.
  if (scoredMatches.length) {
    const { error: lockError } = await supabase
      .from('matches')
      .update({ locked: true })
      .in('id', scoredMatches.map(m => m.matchId))
    if (lockError) throw lockError
  }
  if (resolvedPikas.length) {
    const { error: lockError } = await supabase
      .from('pikanteria')
      .update({ locked: true })
      .in('id', resolvedPikas.map(p => p.pikanteriaId))
    if (lockError) throw lockError
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
  const result = parsePick(formData.get(`pik_${pikanteriaId}`), `pikanteria ${pikanteriaId}`)
  await scoreItems(supabase, matchDayId, [], [{ pikanteriaId, result }])
  redirect('/admin/results')
}

async function resetPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = await createServiceClient()
  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')

  const { error } = await supabase.rpc('reset_pikanteria_result', {
    p_pikanteria_id: pikanteriaId,
  })
  if (error) throw new Error(`Reset failed and was rolled back: ${error.message}`)

  await snapshotMatchDay(supabase, matchDayId)

  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/admin/scores')
  redirect('/admin/results')
}

async function resetMatch(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = await createServiceClient()
  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const matchId = parseUUID(formData.get('match_id'), 'match_id')

  const { error } = await supabase.rpc('reset_match_result', {
    p_match_id: matchId,
    p_match_day_id: matchDayId,
  })
  if (error) throw new Error(`Reset failed and was rolled back: ${error.message}`)

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
        const sortedMatches = matchDay.matches.toSorted(
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
                      type="submit"
                      formAction={resetMatch}
                      formNoValidate
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
              const outcomes = [
                { value: '1', label: pika.label_1, odds: pika.odds_1 },
                ...(pika.label_x != null && pika.odds_x != null
                  ? [{ value: 'X', label: pika.label_x, odds: pika.odds_x }] : []),
                { value: '2', label: pika.label_2, odds: pika.odds_2 },
              ]
              const resolved = pika.result != null
              const resultLabel = outcomes.find(o => o.value === pika.result)?.label
              return (
                <form key={pika.id} action={scorePikanteria} className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                  <input type="hidden" name="match_day_id" value={matchDay.id} />
                  <input type="hidden" name="pikanteria_id" value={pika.id} />
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text">{pika.question}</p>
                    {resolved && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--border-accent)' }}>
                        ✓ {resultLabel ?? pika.result}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {outcomes.map(opt => (
                      <label key={opt.value}
                        className="flex-1 flex items-center gap-1.5 rounded-lg p-2 cursor-pointer min-w-[80px]"
                        style={inputStyle}>
                        <input type="radio" name={`pik_${pika.id}`} value={opt.value} required
                          defaultChecked={pika.result === opt.value} />
                        <span className="text-[10px] font-bold text-muted">{opt.value}</span>
                        <span className="text-xs text-text font-medium">{opt.label}</span>
                        <span className="text-[10px] text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                          {Number(opt.odds).toFixed(2)}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className={`${scoreBtn} py-2`} style={{ ...scoreBtnStyle, flex: 1 }}>
                      {resolved ? '✏️ Update answer' : '⚡ Score this question'}
                    </button>
                    {resolved && (
                      <button type="submit" formAction={resetPikanteria} formNoValidate
                        className={`${scoreBtn} py-2 px-4`} style={{ background: 'var(--color-danger)', color: '#fff' }}>
                        ↺ Reset
                      </button>
                    )}
                  </div>
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
