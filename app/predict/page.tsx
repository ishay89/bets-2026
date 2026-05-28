import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { MatchCard } from '@/components/match-card'
import { PicanteriaCard } from '@/components/pikanteria-card'
import { LockTimer } from '@/components/lock-timer'
import { BottomNav } from '@/components/bottom-nav'
import type { Match, MatchDay, Pikanteria, PicanteriaOption, Pick } from '@/lib/types'
import {
  PRE_TOURNAMENT_PATH,
  hasCompletedPreTournamentPick,
  shouldRequirePreTournamentPick,
} from '@/lib/pre-tournament'

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage ×1', r16: 'Round of 16 ×1.5', qf: 'Quarter Finals ×1.5',
  sf: 'Semi Finals ×2', '3rd': 'Third Place ×1.5', final: 'Final ×3',
}

type FullMatchDay = MatchDay & {
  matches: Match[]
  pikanteria: (Pikanteria & { pikanteria_options: PicanteriaOption[] })[]
}

export default async function PredictPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: matchDaysRaw }, { data: preTournamentPick }] = await Promise.all([
    supabase
      .from('match_days')
      .select('*, matches(*), pikanteria(*, pikanteria_options(*))')
      .not('published_at', 'is', null)
      .order('date', { ascending: true }),
    supabase
      .from('pre_tournament_picks')
      .select('winner_team, top_scorer')
      .eq('user_id', user!.id)
      .maybeSingle(),
  ])

  if (shouldRequirePreTournamentPick('/predict', hasCompletedPreTournamentPick(preTournamentPick))) {
    redirect(PRE_TOURNAMENT_PATH)
  }

  const matchDays = (matchDaysRaw ?? []) as FullMatchDay[]
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: existingPredictions }, { data: existingAnswers }] = await Promise.all([
    supabase.from('predictions').select('match_id, pick').eq('user_id', user!.id),
    supabase.from('pikanteria_answers').select('pikanteria_id, option_id').eq('user_id', user!.id),
  ])

  const predictionMap = Object.fromEntries(
    (existingPredictions ?? []).map(p => [p.match_id, p.pick as Pick])
  )
  const answerMap = Object.fromEntries(
    (existingAnswers ?? []).map(a => [a.pikanteria_id, a.option_id as string])
  )

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

  async function saveAnswer(picanteriaId: string, optionId: string) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('pikanteria_answers').upsert(
      { user_id: user!.id, pikanteria_id: picanteriaId, option_id: optionId },
      { onConflict: 'user_id,pikanteria_id' }
    )
    revalidatePath('/predict')
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-2">
        <div className="text-[22px] font-extrabold text-text tracking-tight leading-tight">Today&apos;s picks</div>
      </div>

      <main className="px-4 pb-28 space-y-6 mt-2">
        {matchDays.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-text font-semibold">No matches published yet</div>
            <div className="text-muted text-sm mt-1">The admin hasn&apos;t published any matches yet</div>
          </div>
        )}

        {matchDays.map((matchDay, idx) => {
          const isLocked = new Date() >= new Date(matchDay.lock_time)
          const isToday = matchDay.date === today
          const stageLabel = STAGE_LABELS[matchDay.stage] ?? matchDay.stage
          const multiplier = stageLabel.includes('×') ? `×${stageLabel.split('×')[1]}` : ''
          const pikaItems = matchDay.pikanteria
          const sortedMatches = [...matchDay.matches].sort(
            (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
          )
          const dateLabel = new Date(matchDay.date + 'T12:00:00Z').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          })

          return (
            <div key={matchDay.id} className="space-y-3">
              {/* Day header */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
                    {stageLabel}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text">{dateLabel}</span>
                    {isToday && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--color-accent)', color: '#000' }}>
                        TODAY
                      </span>
                    )}
                  </div>
                </div>

                {isLocked ? (
                  <div className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(239,79,91,0.08)', color: 'var(--color-danger)', border: '1px solid rgba(239,79,91,0.25)' }}>
                    🔒 Locked
                  </div>
                ) : (
                  <div className="flex flex-col items-end rounded-[10px] px-2.5 py-1.5"
                    style={{ background: 'rgba(245,166,35,0.13)', border: '1px solid rgba(245,166,35,0.3)' }}>
                    <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-amber)' }}>Locks</div>
                    <div className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-amber)' }}>
                      <LockTimer lockTime={matchDay.lock_time} />
                    </div>
                  </div>
                )}
              </div>

              {/* Matches */}
              <div className="text-[10px] font-bold uppercase tracking-[1.2px]"
                style={{ color: 'var(--color-muted)' }}>
                Matches{multiplier ? ` · Multiplier ${multiplier}` : ''}
              </div>
              {sortedMatches.map(match => (
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
              {pikaItems.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-lg">🌶️</span>
                    <span className="text-[10px] font-bold uppercase tracking-[1.2px]"
                      style={{ color: 'var(--color-amber)' }}>
                      Pikanteria · {pikaItems.length} side bets
                    </span>
                  </div>
                  {pikaItems.map(item => (
                    <PicanteriaCard
                      key={item.id}
                      item={{ ...item, options: [...(item.pikanteria_options ?? [])].sort((a, b) => a.sort_order - b.sort_order) }}
                      currentAnswer={answerMap[item.id] ?? null}
                      isLocked={isLocked}
                      onSave={saveAnswer}
                    />
                  ))}
                </>
              )}

              {idx < matchDays.length - 1 && (
                <div className="border-t mt-2" style={{ borderColor: 'rgba(255,255,255,0.04)' }} />
              )}
            </div>
          )
        })}
      </main>

      <BottomNav />
    </div>
  )
}
