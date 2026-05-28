import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { MatchCard } from '@/components/match-card'
import { PicanteriaCard } from '@/components/pikanteria-card'
import { LockTimer } from '@/components/lock-timer'
import { BottomNav } from '@/components/bottom-nav'
import type { Match, Pikanteria, Pick } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage ×1', r16: 'Round of 16 ×1.5', qf: 'Quarter Finals ×1.5',
  sf: 'Semi Finals ×2', '3rd': 'Third Place ×1.5', final: 'Final ×3',
}

export default async function PredictPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = new Date().toISOString().slice(0, 10)
  const { data: matchDay } = await supabase
    .from('match_days')
    .select('*, matches(*), pikanteria(*)')
    .eq('date', today)
    .not('published_at', 'is', null)
    .single()

  const [{ data: existingPredictions }, { data: existingAnswers }] = await Promise.all([
    supabase.from('predictions').select('match_id, pick').eq('user_id', user!.id),
    supabase.from('pikanteria_answers').select('pikanteria_id, answer').eq('user_id', user!.id),
  ])

  const predictionMap = Object.fromEntries(
    (existingPredictions ?? []).map(p => [p.match_id, p.pick as Pick])
  )
  const answerMap = Object.fromEntries(
    (existingAnswers ?? []).map(a => [a.pikanteria_id, a.answer as boolean])
  )

  const isLocked = matchDay ? new Date() >= new Date(matchDay.lock_time) : false

  async function savePick(matchId: string, pick: Pick) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('predictions').upsert(
      { user_id: user!.id, match_id: matchId, pick },
      { onConflict: 'user_id,match_id' }
    )
    revalidatePath('/predict')
  }

  async function saveAnswer(picanteriaId: string, answer: boolean) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('pikanteria_answers').upsert(
      { user_id: user!.id, pikanteria_id: picanteriaId, answer },
      { onConflict: 'user_id,pikanteria_id' }
    )
    revalidatePath('/predict')
  }

  const stageLabel = matchDay ? (STAGE_LABELS[matchDay.stage] ?? matchDay.stage) : ''

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            {stageLabel}
          </div>
          <div className="text-[22px] font-extrabold text-text tracking-tight leading-tight">Today&apos;s picks</div>
        </div>
        {matchDay && !isLocked && (
          <div className="flex flex-col items-end rounded-[10px] px-2.5 py-1.5"
            style={{ background: 'rgba(245,166,35,0.13)', border: '1px solid rgba(245,166,35,0.3)' }}>
            <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-amber)' }}>Locks</div>
            <div className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-amber)' }}>
              <LockTimer lockTime={matchDay.lock_time} />
            </div>
          </div>
        )}
      </div>

      <main className="px-4 pb-28 space-y-3 mt-2">
        {!matchDay && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-text font-semibold">No matches today</div>
            <div className="text-muted text-sm mt-1">The admin hasn&apos;t published today&apos;s form yet</div>
          </div>
        )}

        {matchDay && (
          <>
            {isLocked && (
              <div className="rounded-xl px-4 py-3"
                style={{ background: 'rgba(239,79,91,0.08)', border: '1px solid rgba(239,79,91,0.25)' }}>
                <span className="text-[12px] font-bold" style={{ color: 'var(--color-danger)' }}>
                  🔒 Picks are locked for today
                </span>
              </div>
            )}

            {!isLocked && <LockTimer lockTime={matchDay.lock_time} />}

            {/* Matches */}
            <div className="text-[10px] font-bold uppercase tracking-[1.2px] pt-2"
              style={{ color: 'var(--color-muted)' }}>
              Matches · Multiplier {stageLabel.split('×')[1] ? `×${stageLabel.split('×')[1]}` : ''}
            </div>

            {(matchDay.matches as Match[]).map(match => (
              <MatchCard
                key={match.id}
                match={match}
                currentPick={predictionMap[match.id] ?? null}
                isLocked={isLocked}
                stageLabel={stageLabel}
                onSave={savePick}
              />
            ))}

            {/* Pikanteria */}
            {(matchDay.pikanteria as Pikanteria[]).length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-4">
                  <span className="text-lg">🌶️</span>
                  <span className="text-[10px] font-bold uppercase tracking-[1.2px]"
                    style={{ color: 'var(--color-amber)' }}>
                    Pikanteria · {(matchDay.pikanteria as Pikanteria[]).length} side bets
                  </span>
                </div>
                {(matchDay.pikanteria as Pikanteria[]).map(item => (
                  <PicanteriaCard
                    key={item.id}
                    item={item}
                    currentAnswer={answerMap[item.id] ?? null}
                    isLocked={isLocked}
                    onSave={saveAnswer}
                  />
                ))}
              </>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
