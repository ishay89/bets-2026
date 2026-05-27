import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/bottom-nav'
import type { Match, Pikanteria, Pick } from '@/lib/types'

type PredRow = { pick: Pick; points: number | null; user_id: string }
type MatchWithPreds = Match & { predictions: PredRow[] }
type PikaAnswerRow = { answer: boolean; points: number | null; user_id: string }
type PikaWithAnswers = Pikanteria & { pikanteria_answers: PikaAnswerRow[] }
type DayRow = { id: string; date: string; stage: string; matches: MatchWithPreds[]; pikanteria: PikaWithAnswers[] }

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: matchDays } = await supabase
    .from('match_days')
    .select(`
      id, date, stage,
      matches(id, home_team, away_team, result,
        predictions(pick, points, user_id)
      ),
      pikanteria(id, question, result,
        pikanteria_answers(answer, points, user_id)
      )
    `)
    .not('published_at', 'is', null)
    .order('date', { ascending: false })

  // Collect last-15 picks for streak grid
  const allPicks: ('W' | 'L' | null)[] = []
  for (const day of ((matchDays ?? []) as DayRow[]).slice(0, 10)) {
    for (const m of day.matches) {
      const pred = m.predictions.find(p => p.user_id === user!.id)
      if (pred && m.result !== null) {
        allPicks.push(pred.pick === m.result ? 'W' : 'L')
      }
    }
  }
  const streak = allPicks.slice(-15)
  const wins = streak.filter(s => s === 'W').length

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            Your bets so far
          </div>
          <div className="text-[22px] font-extrabold text-text tracking-tight">History</div>
        </div>
      </div>

      <main className="px-4 pb-28 space-y-4">
        {/* Streak grid */}
        {streak.length > 0 && (
          <div className="rounded-[14px] p-4" style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-muted">
                Last {streak.length} picks
              </span>
              <span className="text-[11px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-sub)' }}>
                {wins}W · {streak.length - wins}L · {streak.length > 0 ? Math.round(wins / streak.length * 100) : 0}%
              </span>
            </div>
            <div className="flex gap-1">
              {streak.map((s, i) => (
                <div key={i}
                  className="flex-1 h-7 rounded flex items-center justify-center text-[10px] font-extrabold"
                  style={{
                    background: s === 'W' ? 'rgba(0,217,126,0.14)' : 'rgba(239,79,91,0.13)',
                    border: `1px solid ${s === 'W' ? 'rgba(0,217,126,0.32)' : 'rgba(239,79,91,0.3)'}`,
                    color: s === 'W' ? 'var(--color-accent)' : 'var(--color-danger)',
                  }}
                >{s}</div>
              ))}
            </div>
          </div>
        )}

        {/* Day cards */}
        <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5 text-muted">By day</div>
        {(matchDays ?? []).length === 0 && (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-text font-semibold">No history yet</div>
          </div>
        )}

        {((matchDays ?? []) as DayRow[]).map((day) => {
          const myMatchPreds = day.matches.map(m => ({
            ...m,
            myPick: m.predictions.find(p => p.user_id === user!.id),
          }))
          const myPikaAnswers = day.pikanteria.map(p => ({
            ...p,
            myAnswer: p.pikanteria_answers.find(a => a.user_id === user!.id),
          }))
          const dayPoints = [
            ...myMatchPreds.map(m => m.myPick?.points ?? 0),
            ...myPikaAnswers.map(p => p.myAnswer?.points ?? 0),
          ].reduce((a, b) => a + b, 0)

          return (
            <div key={day.id} className="rounded-[14px] overflow-hidden"
              style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <div className="font-bold text-[13px] text-text">{day.date}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted mt-0.5">
                    {STAGE_LABELS[day.stage] ?? day.stage}
                  </div>
                </div>
                <div className="font-bold text-[18px]"
                  style={{ fontFamily: 'var(--font-mono)', color: dayPoints > 0 ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                  +{dayPoints.toFixed(1)}
                </div>
              </div>
              <div className="px-4 py-2 space-y-1.5">
                {myMatchPreds.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 py-1.5"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-base">{/* flag */}</span>
                    <span className="text-[12px] text-sub flex-1">{m.home_team} vs {m.away_team}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded"
                        style={{ background: 'var(--color-elev)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text)' }}>
                        {m.myPick?.pick ?? '—'}
                      </span>
                      <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                        {m.myPick ? (m.result !== null
                          ? m.myPick.pick === m.result
                            ? `+${(m.myPick.points ?? 0).toFixed(2)}`
                            : `✗ (${m.result})`
                          : 'pending'
                        ) : '—'}
                      </span>
                      {m.result !== null && m.myPick && (
                        <span className="text-[10px] font-extrabold w-4 text-center"
                          style={{ color: m.myPick.pick === m.result ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                          {m.myPick.pick === m.result ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {myPikaAnswers.filter(p => p.myAnswer).map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-1.5"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[11px] flex-1" style={{ color: 'var(--color-amber)' }}>🌶️ {p.question}</span>
                    <span className="text-[11px] text-text">{p.myAnswer.answer ? 'Yes' : 'No'}</span>
                    {p.result !== null && (
                      <span className="text-[10px] font-extrabold w-4 text-center"
                        style={{ color: p.myAnswer.answer === p.result ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                        {p.myAnswer.answer === p.result ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </main>

      <BottomNav />
    </div>
  )
}
