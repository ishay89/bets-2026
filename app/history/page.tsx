import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/bottom-nav'
import { getMatchDaysWithUserData } from '@/lib/data'

export const metadata = { title: 'History | Mondial Bets 2026', description: 'Your prediction history' }

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const matchDays = await getMatchDaysWithUserData(supabase)

  // matchDays arrives newest-first; build the pick list in chronological order
  // (oldest day first, matches by kickoff) so slice(-15) really is the latest
  // 15 picks, rendered oldest → newest.
  const allPicks: { outcome: 'W' | 'L'; matchId: string }[] = []
  for (const day of matchDays.slice(0, 10).toReversed()) {
    const dayMatches = day.matches.toSorted(
      (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
    )
    for (const m of dayMatches) {
      const pred = m.predictions.find(p => p.user_id === user.id)
      if (pred && m.result !== null) {
        allPicks.push({ outcome: pred.pick === m.result ? 'W' : 'L', matchId: m.id })
      }
    }
  }
  const streak = allPicks.slice(-15)
  const wins = streak.filter(s => s.outcome === 'W').length

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
        {streak.length > 0 && (
          <div className="rounded-[14px] p-4" style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-muted">
                Last {streak.length} picks
              </span>
              <span className="text-[11px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-sub)' }}>
                {wins}W · {streak.length - wins}L · {streak.length > 0 ? Math.round(wins / streak.length * 100) : 0}%
              </span>
            </div>
            <div className="flex gap-1">
              {streak.map((s) => (
                <div key={s.matchId}
                  className="flex-1 h-7 rounded flex items-center justify-center text-[10px] font-extrabold"
                  style={{
                    background: s.outcome === 'W' ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
                    border: `1px solid ${s.outcome === 'W' ? 'var(--border-accent)' : 'var(--border-danger)'}`,
                    color: s.outcome === 'W' ? 'var(--color-accent)' : 'var(--color-danger)',
                  }}
                >{s.outcome}</div>
              ))}
            </div>
          </div>
        )}

        <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5 text-muted">By day</div>
        {matchDays.length === 0 && (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-text font-semibold">No history yet</div>
          </div>
        )}

        {matchDays.map((day) => {
          const myMatchPreds = day.matches.map(m => ({
            ...m,
            myPick: m.predictions.find(p => p.user_id === user.id),
          }))
          const labelForPick = (p: typeof day.pikanteria[number], pick: string | null) => {
            if (pick === '1') return p.label_1
            if (pick === '2') return p.label_2
            if (pick === 'X') return p.label_x
            return null
          }
          const myPikaAnswers = day.pikanteria.map(p => {
            const myAnswer = p.pikanteria_answers.find(a => a.user_id === user.id)
            const myLabel = myAnswer ? labelForPick(p, myAnswer.pick) : null
            return { ...p, myAnswer, myLabel }
          })
          const dayPoints = [
            ...myMatchPreds.map(m => m.myPick?.points ?? 0),
            ...myPikaAnswers.map(p => p.myAnswer?.points ?? 0),
          ].reduce((a, b) => a + b, 0)

          return (
            <div key={day.id} className="rounded-[14px] overflow-hidden"
              style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid var(--border-base)' }}>
                <div>
                  <div className="font-bold text-[13px] text-text">{day.date}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted mt-0.5">
                    {STAGE_LABELS[day.stage] ?? day.stage}
                  </div>
                </div>
                <div className="font-bold text-[18px]"
                  style={{ fontFamily: 'var(--font-mono)', color: dayPoints > 0 ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                  +{dayPoints.toFixed(2)}
                </div>
              </div>
              <div className="px-4 py-2 space-y-1.5">
                {myMatchPreds.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 py-1.5"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span className="text-base">{/* flag */}</span>
                    <span className="text-[12px] text-sub flex-1">{m.home_team} vs {m.away_team}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded"
                        style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)', color: 'var(--color-text)' }}>
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
                {myPikaAnswers.filter((p): p is typeof p & { myAnswer: NonNullable<typeof p['myAnswer']> } => p.myAnswer !== undefined).map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-1.5"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span className="text-[11px] flex-1" style={{ color: 'var(--color-amber)' }}>
                      🌶️ {p.question}
                    </span>
                    <span className="text-[11px] text-text">{p.myLabel ?? '?'}</span>
                    {p.result !== null && (
                      <span className="text-[10px] font-extrabold w-4 text-center"
                        style={{ color: p.myAnswer.pick === p.result ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                        {p.myAnswer.pick === p.result ? '✓' : '✗'}
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
