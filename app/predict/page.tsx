import { shouldWriteAuditEvent, writeAuditEvent, type AuditJson } from '@/lib/audit'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { MatchCard } from '@/components/match-card'
import { PicanteriaCard } from '@/components/pikanteria-card'
import { LockTimer } from '@/components/lock-timer'
import { BottomNav } from '@/components/bottom-nav'
import type { Match, Pikanteria, PicanteriaOption, Pick } from '@/lib/types'

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
    .select('*, matches(*), pikanteria(*, pikanteria_options(*))')
    .eq('date', today)
    .not('published_at', 'is', null)
    .single()

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

  const isLocked = matchDay ? new Date() >= new Date(matchDay.lock_time) : false

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

  const stageLabel = matchDay ? (STAGE_LABELS[matchDay.stage] ?? matchDay.stage) : ''

  return (
    <div className="app-shell bg-bg">
      {/* Header */}
      <div className="stadium-header flex items-center justify-between px-4 pt-4 pb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            {stageLabel}
          </div>
          <div className="brand-wordmark text-[24px] leading-tight">Today&apos;s slip</div>
        </div>
        {matchDay && !isLocked && (
          <div className="flex flex-col items-end rounded-lg px-2.5 py-1.5"
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
            <div className="ball-mark w-16 h-16 rounded-lg mx-auto mb-3" aria-hidden="true" />
            <div className="text-text font-semibold">No matches today</div>
            <div className="text-muted text-sm mt-1">The admin hasn&apos;t published today&apos;s form yet</div>
          </div>
        )}

        {matchDay && (
          <>
            {isLocked && (
              <div className="rounded-lg px-4 py-3"
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
            {(matchDay.pikanteria as (Pikanteria & { pikanteria_options: PicanteriaOption[] })[]).length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-4">
                  <span className="text-lg">🌶️</span>
                  <span className="text-[10px] font-bold uppercase tracking-[1.2px]"
                    style={{ color: 'var(--color-amber)' }}>
                    Pikanteria · {(matchDay.pikanteria as (Pikanteria & { pikanteria_options: PicanteriaOption[] })[]).length} side bets
                  </span>
                </div>
                {(matchDay.pikanteria as (Pikanteria & { pikanteria_options: PicanteriaOption[] })[]).map(item => (
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
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
