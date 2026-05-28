import { shouldWriteAuditEvent, writeAuditEvent, type AuditJson } from '@/lib/audit'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { MatchCard } from '@/components/match-card'
import { PicanteriaCard } from '@/components/pikanteria-card'
import { LockTimer } from '@/components/lock-timer'
import { BottomNav } from '@/components/bottom-nav'
import type { Match, MatchDay, Pikanteria, PicanteriaOption, Pick } from '@/lib/types'

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

  const { data: matchDaysRaw } = await supabase
    .from('match_days')
    .select('*, matches(*), pikanteria(*, pikanteria_options(*))')
    .not('published_at', 'is', null)
    .order('date', { ascending: true })

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
    if (!user) throw new Error('Unauthorized')

    const service = await createServiceClient()
    const [{ data: match }, { data: existing }] = await Promise.all([
      service
        .from('matches')
        .select('id, match_day_id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away, match_days(id, date, lock_time, stage)')
        .eq('id', matchId)
        .single(),
      service
        .from('predictions')
        .select('id, pick')
        .eq('user_id', user.id)
        .eq('match_id', matchId)
        .maybeSingle(),
    ])

    const matchDay = Array.isArray(match?.match_days) ? match.match_days[0] : match?.match_days
    if (!match || !matchDay) throw new Error('Match not found')
    if (new Date() >= new Date(matchDay.lock_time)) throw new Error('Picks are locked')

    const oldValue: AuditJson | null = existing ? { pick: existing.pick } : null
    const newValue: AuditJson = { pick }
    const shouldAudit = shouldWriteAuditEvent(oldValue, newValue)

    const { data: savedPrediction, error } = await service.from('predictions').upsert(
      { user_id: user!.id, match_id: matchId, pick },
      { onConflict: 'user_id,match_id' }
    ).select('id').single()
    if (error) throw error

    if (shouldAudit) {
      await writeAuditEvent(service, {
        user_id: user.id,
        event_type: 'match_prediction',
        action: existing ? 'update' : 'create',
        entity_id: savedPrediction.id,
        entity_ref: matchId,
        old_value: oldValue,
        new_value: newValue,
        metadata: {
          match_id: match.id,
          match_day_id: match.match_day_id,
          date: matchDay.date,
          stage: matchDay.stage,
          home_team: match.home_team,
          away_team: match.away_team,
          kickoff_time: match.kickoff_time,
          odds_home: match.odds_home,
          odds_draw: match.odds_draw,
          odds_away: match.odds_away,
        },
      })
    }

    revalidatePath('/predict')
  }

  async function saveAnswer(picanteriaId: string, optionId: string) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const service = await createServiceClient()
    const [{ data: item }, { data: selectedOption }, { data: existing }] = await Promise.all([
      service
        .from('pikanteria')
        .select('id, question, match_day_id, match_days(id, date, lock_time, stage)')
        .eq('id', picanteriaId)
        .single(),
      service
        .from('pikanteria_options')
        .select('id, label, odds')
        .eq('id', optionId)
        .eq('pikanteria_id', picanteriaId)
        .single(),
      service
        .from('pikanteria_answers')
        .select('id, option_id, pikanteria_options(id, label, odds)')
        .eq('user_id', user.id)
        .eq('pikanteria_id', picanteriaId)
        .maybeSingle(),
    ])

    const matchDay = Array.isArray(item?.match_days) ? item.match_days[0] : item?.match_days
    if (!item || !matchDay || !selectedOption) throw new Error('Pikanteria option not found')
    if (new Date() >= new Date(matchDay.lock_time)) throw new Error('Pikanteria answers are locked')

    const previousOption = Array.isArray(existing?.pikanteria_options)
      ? existing?.pikanteria_options[0]
      : existing?.pikanteria_options
    const oldValue: AuditJson | null = existing ? {
      option_id: existing.option_id,
      label: previousOption?.label ?? null,
      odds: previousOption?.odds ?? null,
    } : null
    const newValue: AuditJson = {
      option_id: selectedOption.id,
      label: selectedOption.label,
      odds: selectedOption.odds,
    }
    const shouldAudit = shouldWriteAuditEvent(oldValue, newValue)

    const { data: savedAnswer, error } = await service.from('pikanteria_answers').upsert(
      { user_id: user!.id, pikanteria_id: picanteriaId, option_id: optionId },
      { onConflict: 'user_id,pikanteria_id' }
    ).select('id').single()
    if (error) throw error

    if (shouldAudit) {
      await writeAuditEvent(service, {
        user_id: user.id,
        event_type: 'pikanteria_answer',
        action: existing ? 'update' : 'create',
        entity_id: savedAnswer.id,
        entity_ref: picanteriaId,
        old_value: oldValue,
        new_value: newValue,
        metadata: {
          pikanteria_id: item.id,
          question: item.question,
          match_day_id: item.match_day_id,
          date: matchDay.date,
          stage: matchDay.stage,
        },
      })
    }

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
