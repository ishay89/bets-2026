import { unstable_cache } from 'next/cache'
import { after } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { LeaderboardRealtime } from '@/components/leaderboard-realtime'
import { Leaderboard } from '@/components/leaderboard'
import { LeaderboardDaySelector } from '@/components/leaderboard-day-selector'
import { BottomNav } from '@/components/bottom-nav'
import { getHistoricalLeaderboardEntries, getLeaderboardEntries, getScoredLeaderboardDays, isFuturesLocked } from '@/lib/data'
import { maybeSyncLiveScores } from '@/lib/live-sync'
import type { LeaderboardFuturesPick } from '@/lib/types'
import { ScenarioSimulator } from '@/components/scenario-simulator'
import { withCurrentFuturesOdds } from '@/lib/pre-tournament'
import type { ScenarioFuturesPick } from '@/lib/scenario-leaderboard'

const getCachedLeaderboardEntries = unstable_cache(
  () => getLeaderboardEntries(createAdminClient()),
  ['leaderboard-entries'],
  { revalidate: 300, tags: ['leaderboard'] },
)

const getCachedScoredDays = unstable_cache(
  () => getScoredLeaderboardDays(createAdminClient()),
  ['scored-leaderboard-days'],
  { revalidate: 300, tags: ['leaderboard'] },
)

// Live match count — drives the "X matches live" banner. 60s TTL; flushed
// sooner by revalidatePath('/leaderboard') in the live-sync background task.
const getCachedLiveMatchCount = unstable_cache(
  async (): Promise<number> => {
    const supabase = createAdminClient()
    const { count, error } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .in('live_status', ['IN_PLAY', 'PAUSED'])
      .not('published_at', 'is', null)
    if (error) throw error
    return count ?? 0
  },
  ['live-match-count'],
  { revalidate: 60 },
)

// Everyone's futures picks (champion + top scorer) for the picks line under
// each leaderboard name. Only exposed once futures are locked — the same
// gating as the reveal sheets on /predict — and immutable after that, so a
// 30 min cache is safe. Small table (one row per player), no pagination risk.
type CachedFuturesData = {
  leaderboardPicks: Record<string, LeaderboardFuturesPick>
  scenarioPicks: ScenarioFuturesPick[]
}

const getCachedFuturesPicks = unstable_cache(
  async (): Promise<CachedFuturesData | null> => {
    const supabase = createAdminClient()
    if (!(await isFuturesLocked(supabase))) return null
    const { data, error } = await supabase
      .from('pre_tournament_picks')
      .select('user_id, winner_team, winner_odds, top_scorer, top_scorer_odds, winner_points, top_scorer_points')
    if (error) throw error
    const scenarioPicks = (data ?? []).map(withCurrentFuturesOdds)
    return {
      leaderboardPicks: Object.fromEntries(
        scenarioPicks.map(p => [p.user_id, { winner: p.winner_team, scorer: p.top_scorer }]),
      ),
      scenarioPicks,
    }
  },
  ['leaderboard-futures-picks'],
  { revalidate: 1800, tags: ['leaderboard'] },
)

// Historical snapshots are immutable after scoring; cache per day for 30 min.
// Fetches its own scored-days list so the entry is self-contained at 30 min TTL.
const getCachedHistoricalEntries = unstable_cache(
  async (selectedDayId: string) => {
    const supabase = createAdminClient()
    const days = await getScoredLeaderboardDays(supabase)
    return getHistoricalLeaderboardEntries(supabase, selectedDayId, days)
  },
  ['historical-leaderboard-entries'],
  { revalidate: 1800, tags: ['leaderboard-history'] },
)

export const metadata = { title: 'Leaderboard | Mondial Bets 2026', description: 'Full player leaderboard' }

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>
}) {
  const [{ day }, supabase] = await Promise.all([searchParams, createClient()])

  after(maybeSyncLiveScores)

  const [{ data: { user } }, liveEntries, scoredDays, liveMatchCount, futuresData] = await Promise.all([
    supabase.auth.getUser(),
    getCachedLeaderboardEntries(),
    getCachedScoredDays(),
    getCachedLiveMatchCount(),
    getCachedFuturesPicks(),
  ])
  const selectedDay = scoredDays.find(scoredDay => scoredDay.id === day) ?? null
  const futuresPicks = futuresData?.leaderboardPicks ?? null
  const entries = selectedDay
    ? await getCachedHistoricalEntries(selectedDay.id)
    : liveEntries
  const eyebrow = selectedDay ? `As of ${selectedDay.date} - ${selectedDay.stage}` : 'Live rankings'

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
            {eyebrow}
          </div>
          <div className="font-display text-[22px] font-extrabold text-text tracking-tight">Leaderboard</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-[11px] font-semibold text-sub">{entries.length} players</div>
          <LeaderboardDaySelector days={scoredDays} selectedDayId={selectedDay?.id ?? null} />
        </div>
      </div>

      {liveMatchCount > 0 && !selectedDay && (
        <div
          className="mx-4 mb-1 px-3 py-2 rounded-xl text-[12px] font-semibold"
          style={{
            background: 'var(--color-danger-soft)',
            color: 'var(--color-danger)',
            border: '1px solid var(--border-danger)',
          }}
        >
          ● {liveMatchCount} {liveMatchCount === 1 ? 'match' : 'matches'} live now · rankings update after final whistle
        </div>
      )}

      <main className="pb-24">
        {!selectedDay && futuresData && (
          <div className="px-4 pb-4">
            <ScenarioSimulator
              entries={liveEntries}
              picks={futuresData.scenarioPicks}
              currentUserId={user?.id ?? ''}
            />
          </div>
        )}
        {selectedDay ? (
          <Leaderboard
            entries={entries}
            currentUserId={user?.id ?? ''}
            futuresPicks={futuresPicks}
            todayModeLabel="Day"
            movementPointsLabel="day"
            todayEmptyMessage="No results scored for this selected day"
          />
        ) : (
          <LeaderboardRealtime initialEntries={entries} currentUserId={user?.id ?? ''} futuresPicks={futuresPicks} />
        )}
      </main>

      <BottomNav />
    </div>
  )
}
