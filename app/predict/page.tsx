import { unstable_cache } from 'next/cache'
import { after } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { maybeSyncLiveScores } from '@/lib/live-sync'
import { BottomNav } from '@/components/bottom-nav'
import type { Pick } from '@/lib/types'
import type { CrowdTally } from '@/lib/crowd'
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
import { persistDueMatchLocks, persistDuePikanteriaLocks } from '@/lib/match-lock-persistence'
import { getMatchPredictionsReveal, getPikanteriaAnswersReveal } from '@/lib/prediction-reveals'
import { appDateKey } from '@/lib/time'
import { MatchDaySection } from '@/components/match-day-section'
import { LazyMatchDayList } from '@/components/lazy-match-day-list'
import { PredictLiveRefresh } from '@/components/predict-live-refresh'
import { getPredictLiveRefreshMatchIds, sortPredictMatchDays } from '@/lib/predict-match-order'

export const metadata = { title: 'Predict | Mondial Bets 2026' }

// Crowd pick aggregates are the same for every user; cache for 60s to reduce
// RPC calls during busy match days without meaningfully staling the data.
type CrowdMatchRow = { match_id: string; pick: Pick; cnt: number }
type CrowdPikRow = { pikanteria_id: string; pick: Pick; cnt: number }

const getCachedCrowdMatchPicks = unstable_cache(
  async (): Promise<CrowdMatchRow[]> => {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('crowd_match_picks')
    if (error) throw error
    return (data ?? []) as CrowdMatchRow[]
  },
  ['crowd-match-picks'],
  { revalidate: 60, tags: ['crowd-picks'] },
)

const getCachedCrowdPikPicks = unstable_cache(
  async (): Promise<CrowdPikRow[]> => {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('crowd_pikanteria_picks')
    if (error) throw error
    return (data ?? []) as CrowdPikRow[]
  },
  ['crowd-pik-picks'],
  { revalidate: 60, tags: ['crowd-picks'] },
)

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

const EAGER_DAYS = 5

export default async function PredictPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fire-and-forget live score sync after the response is sent.
  after(maybeSyncLiveScores)

  const adminClient = createAdminClient()
  await Promise.all([
    persistDueMatchLocks(adminClient),
    persistDuePikanteriaLocks(adminClient),
  ])

  const matchDays = await getPublishedMatchDaysWithAll(supabase)

  const today = appDateKey()

  const [
    existingPredictions,
    existingAnswers,
    crowdMatchRows,
    crowdPikRows,
    { data: futuresPick, error: futuresPickError },
    { data: tournamentSettings },
  ] = await Promise.all([
    getUserPredictions(supabase, user.id),
    getUserPikanteriaAnswers(supabase, user.id),
    getCachedCrowdMatchPicks(),
    getCachedCrowdPikPicks(),
    supabase.from('pre_tournament_picks').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('tournament_settings').select('futures_locked, futures_published').eq('id', true).single(),
  ])
  if (futuresPickError) throw futuresPickError

  const hasEntryPick = hasCompletedPreTournamentPick(futuresPick)
  // Stored odds are a snapshot from when the pick was made; show the live odds
  // so the points displayed match the current price (and the eventual scoring).
  const displayFuturesPick = futuresPick ? withCurrentFuturesOdds(futuresPick) : futuresPick
  const futuresLocked = tournamentSettings?.futures_locked ?? false
  const futuresPublished = tournamentSettings?.futures_published ?? true

  // Surface live games first, then open upcoming games, then already-played days.
  const sortedDays = sortPredictMatchDays(matchDays)
  const liveRefreshMatchIds = getPredictLiveRefreshMatchIds(sortedDays)

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
  const crowdTally: Record<string, CrowdTally> = {}
  for (const r of crowdMatchRows) {
    const t = (crowdTally[r.match_id] ??= { '1': 0, X: 0, '2': 0, total: 0 })
    t[r.pick] = r.cnt
    t.total += r.cnt
  }
  const crowdPikTally: Record<string, CrowdTally> = {}
  for (const r of crowdPikRows) {
    const t = (crowdPikTally[r.pikanteria_id] ??= { '1': 0, X: 0, '2': 0, total: 0 })
    t[r.pick] = r.cnt
    t.total += r.cnt
  }

  const eagerDays = sortedDays.slice(0, EAGER_DAYS)
  const lazyDays = sortedDays.slice(EAGER_DAYS)

  const sharedSectionProps = {
    today,
    predictionMap,
    answerMap,
    crowdTally,
    crowdPikTally,
    userId: user.id,
    onSavePick: savePick,
    onSaveAnswer: saveAnswer,
    onRevealMatch: revealMatchPicks,
    onRevealPikanteria: revealPikanteriaAnswers,
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-2">
        <div className="font-display text-[22px] font-extrabold text-text tracking-tight leading-tight">Today&apos;s picks</div>
      </div>

      <main className="px-4 pb-28 space-y-6 mt-2">
        <PredictLiveRefresh matchIds={liveRefreshMatchIds} />

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

        {eagerDays.map((matchDay, idx) => (
          <MatchDaySection
            key={matchDay.id}
            matchDay={matchDay}
            showTopDivider={idx > 0}
            {...sharedSectionProps}
          />
        ))}

        <LazyMatchDayList days={lazyDays} {...sharedSectionProps} />

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
