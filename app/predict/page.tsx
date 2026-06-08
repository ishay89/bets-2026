import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { BetCard, type BetOption } from '@/components/bet-card'
import { LockTimer } from '@/components/lock-timer'
import { BottomNav } from '@/components/bottom-nav'
import type { Pick, Match, Pikanteria } from '@/lib/types'
import { isMatchLocked, matchLockMs } from '@/lib/lock'
import { toPct, matchInsight, type CrowdTally } from '@/lib/crowd'
import { parseUUID, parsePick } from '@/lib/validation'
import { PreTournamentFutures } from '@/components/pre-tournament-futures'
import { MissingPicksBanner } from '@/components/missing-picks-banner'
import { computeUserMissingCounts } from '@/lib/missing-picks'
import { revealFuturesPicks } from '@/app/predict/pre-tournament-actions'
import { hasCompletedPreTournamentPick, withCurrentFuturesOdds } from '@/lib/pre-tournament'
import {
  getPublishedMatchDaysWithAll,
  getUserPredictions,
  getUserPikanteriaAnswers,
} from '@/lib/data'
import {
  saveMatchPrediction,
  savePikanteriaAnswer,
  type SaveResult,
} from '@/lib/prediction-saves'
import { getMatchPredictionsReveal, getPikanteriaAnswersReveal } from '@/lib/prediction-reveals'

export const metadata = { title: 'Predict | Mondial Bets 2026' }

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

// Match → the three fixed outcomes, in display order.
function matchOptions(match: Match): BetOption[] {
  return [
    { pick: '1', label: match.home_team, odds: match.odds_home },
    { pick: 'X', label: 'Draw', odds: match.odds_draw },
    { pick: '2', label: match.away_team, odds: match.odds_away },
  ]
}

// Pikanteria → its outcomes, hiding X when the question is two-way (odds_x null).
function pikaOptions(item: Pikanteria): BetOption[] {
  const opts: BetOption[] = [{ pick: '1', label: item.label_1, odds: item.odds_1 }]
  if (item.odds_x != null && item.label_x != null) {
    opts.push({ pick: 'X', label: item.label_x, odds: item.odds_x })
  }
  opts.push({ pick: '2', label: item.label_2, odds: item.odds_2 })
  return opts
}

function invalidSaveResult(error: unknown): SaveResult {
  const message = error instanceof Error ? error.message : 'Invalid prediction'
  return { ok: false, status: 'invalid', message }
}

function revalidatePredictPath() {
  try {
    revalidatePath('/predict')
  } catch (error) {
    console.error('Failed to revalidate /predict after saving prediction', error)
  }
}

async function savePick(matchId: string, pick: Pick): Promise<SaveResult> {
  'use server'
  try {
    parseUUID(matchId, 'match_id')
    parsePick(pick, 'match')
  } catch (error) {
    return invalidSaveResult(error)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, status: 'error', message: 'Unauthorized' }
  }

  const result = await saveMatchPrediction(supabase, matchId, pick)
  if (result.ok) {
    revalidatePredictPath()
  }

  return result
}

async function saveAnswer(picanteriaId: string, pick: Pick): Promise<SaveResult> {
  'use server'
  try {
    parseUUID(picanteriaId, 'pikanteria_id')
    parsePick(pick, 'pikanteria')
  } catch (error) {
    return invalidSaveResult(error)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, status: 'error', message: 'Unauthorized' }
  }

  const result = await savePikanteriaAnswer(supabase, picanteriaId, pick)
  if (result.ok) {
    revalidatePredictPath()
  }

  return result
}

async function revealMatchPicks(matchId: string) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  return getMatchPredictionsReveal(supabase, matchId)
}

async function revealPikanteriaAnswers(picanteriaId: string) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  return getPikanteriaAnswersReveal(supabase, picanteriaId)
}

export default async function PredictPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const matchDays = await getPublishedMatchDaysWithAll(supabase)

  const today = new Date().toISOString().slice(0, 10)

  const [
    existingPredictions,
    existingAnswers,
    { data: crowdMatchRows, error: crowdMatchError },
    { data: crowdPikRows, error: crowdPikError },
    { data: futuresPick, error: futuresPickError },
    { data: tournamentSettings },
  ] = await Promise.all([
    getUserPredictions(supabase, user.id),
    getUserPikanteriaAnswers(supabase, user.id),
    supabase.rpc('crowd_match_picks'),
    supabase.rpc('crowd_pikanteria_picks'),
    supabase.from('pre_tournament_picks').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('tournament_settings').select('futures_locked, futures_published').eq('id', true).single(),
  ])
  if (crowdMatchError) throw crowdMatchError
  if (crowdPikError) throw crowdPikError
  if (futuresPickError) throw futuresPickError

  const hasEntryPick = hasCompletedPreTournamentPick(futuresPick)
  // Stored odds are a snapshot from when the pick was made; show the live odds
  // so the points displayed match the current price (and the eventual scoring).
  const displayFuturesPick = futuresPick ? withCurrentFuturesOdds(futuresPick) : futuresPick
  const futuresLocked = tournamentSettings?.futures_locked ?? false
  const futuresPublished = tournamentSettings?.futures_published ?? true

  // Surface the most recently published match days first, so a returning player
  // lands on the matches they still need to bet without scrolling.
  const sortedDays = matchDays.toSorted(
    (a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime()
  )

  const predictionMap = Object.fromEntries(
    existingPredictions.map(p => [p.match_id, p.pick as Pick])
  )
  const answerMap = Object.fromEntries(
    existingAnswers.map(a => [a.pikanteria_id, a.pick as Pick])
  )

  const predictedMatchIds = new Set(existingPredictions.map(p => p.match_id))
  const answeredPikanteriaIds = new Set(existingAnswers.map(a => a.pikanteria_id))
  const futuresOpen = futuresPublished && !futuresLocked
  const { missing: missingPicks } = computeUserMissingCounts({
    matchDays,
    predictedMatchIds,
    answeredPikanteriaIds,
    futuresOpen,
    futuresCompleted: hasEntryPick,
  })

  // Aggregate crowd picks (counts only; revealed by the RPCs only after lock).
  // Both matches and pikanteria are tallied by the 1/X/2 pick now.
  const crowdTally: Record<string, CrowdTally> = {}
  for (const r of (crowdMatchRows ?? []) as { match_id: string; pick: Pick; cnt: number }[]) {
    const t = (crowdTally[r.match_id] ??= { '1': 0, X: 0, '2': 0, total: 0 })
    t[r.pick] = r.cnt
    t.total += r.cnt
  }
  const crowdPikTally: Record<string, CrowdTally> = {}
  for (const r of (crowdPikRows ?? []) as { pikanteria_id: string; pick: Pick; cnt: number }[]) {
    const t = (crowdPikTally[r.pikanteria_id] ??= { '1': 0, X: 0, '2': 0, total: 0 })
    t[r.pick] = r.cnt
    t.total += r.cnt
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-2">
        <div className="text-[22px] font-extrabold text-text tracking-tight leading-tight">Today&apos;s picks</div>
      </div>

      <main className="px-4 pb-28 space-y-6 mt-2">
        <MissingPicksBanner missing={missingPicks} />

        {futuresPublished && !hasEntryPick && (
          <PreTournamentFutures
            pick={displayFuturesPick}
            isLocked={futuresLocked}
            myUserId={user.id}
            onReveal={revealFuturesPicks}
          />
        )}

        {matchDays.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-text font-semibold">No matches published yet</div>
            <div className="text-muted text-sm mt-1">The admin hasn&apos;t published any matches yet</div>
          </div>
        )}

        {sortedDays.map((matchDay, idx) => {
          const isToday = matchDay.date === today
          const stageLabel = STAGE_LABELS[matchDay.stage] ?? matchDay.stage
          const pikaItems = matchDay.pikanteria
          const sortedMatches = matchDay.matches.toSorted(
            (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
          )
          const dateLabel = new Date(matchDay.date + 'T12:00:00Z').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          })

          const allMatchesLocked = sortedMatches.length > 0 && sortedMatches.every(m => isMatchLocked(m))

          // Lock timer points to the earliest match's lock time (kickoff − 5 min).
          const earliestLockTime = sortedMatches.length > 0
            ? new Date(Math.min(...sortedMatches.map(m => matchLockMs(m.kickoff_time)))).toISOString()
            : matchDay.lock_time

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

                {sortedMatches.length > 0 && (allMatchesLocked ? (
                  <div className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)', border: '1px solid var(--border-danger)' }}>
                    🔒 Locked
                  </div>
                ) : (
                  <div className="flex flex-col items-end rounded-[10px] px-2.5 py-1.5"
                    style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}>
                    <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-amber)' }}>Locks</div>
                    <div className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-amber)' }}>
                      <LockTimer lockTime={earliestLockTime} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Matches */}
              {sortedMatches.length > 0 && (
                <div className="text-[10px] font-bold uppercase tracking-[1.2px]"
                  style={{ color: 'var(--color-muted)' }}>
                  Matches
                </div>
              )}
              {sortedMatches.map(match => {
                const tally = crowdTally[match.id] ?? { '1': 0, X: 0, '2': 0, total: 0 }
                return (
                  <BetCard
                    key={`${match.id}:${predictionMap[match.id] ?? 'none'}`}
                    id={match.id}
                    variant="match"
                    options={matchOptions(match)}
                    result={match.result}
                    homeTeam={match.home_team}
                    awayTeam={match.away_team}
                    kickoffTime={match.kickoff_time}
                    stageLabel={stageLabel}
                    currentPick={predictionMap[match.id] ?? null}
                    isLocked={isMatchLocked(match)}
                    onSave={savePick}
                    crowd={toPct(tally)}
                    crowdTotal={tally.total}
                    insight={matchInsight({
                      tally,
                      odds: { '1': match.odds_home, X: match.odds_draw, '2': match.odds_away },
                      myPick: predictionMap[match.id] ?? null,
                    })}
                    myUserId={user.id}
                    onReveal={revealMatchPicks}
                  />
                )
              })}

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
                  {pikaItems.map(item => {
                    const tally = crowdPikTally[item.id] ?? { '1': 0, X: 0, '2': 0, total: 0 }
                    return (
                      <BetCard
                        key={`${item.id}:${answerMap[item.id] ?? 'none'}`}
                        id={item.id}
                        variant="pika"
                        question={item.question}
                        options={pikaOptions(item)}
                        result={item.result}
                        currentPick={answerMap[item.id] ?? null}
                        isLocked={item.locked}
                        onSave={saveAnswer}
                        crowd={toPct(tally)}
                        crowdTotal={tally.total}
                        myUserId={user.id}
                        onReveal={revealPikanteriaAnswers}
                      />
                    )
                  })}
                </>
              )}

              {idx < sortedDays.length - 1 && (
                <div className="border-t mt-2" style={{ borderColor: 'var(--border-subtle)' }} />
              )}
            </div>
          )
        })}

        {futuresPublished && hasEntryPick && (
          <PreTournamentFutures
            pick={displayFuturesPick}
            isLocked={futuresLocked}
            myUserId={user.id}
            onReveal={revealFuturesPicks}
          />
        )}
      </main>

      <BottomNav />
    </div>
  )
}
