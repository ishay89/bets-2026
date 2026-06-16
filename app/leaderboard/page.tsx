import { unstable_cache } from 'next/cache'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { LeaderboardRealtime } from '@/components/leaderboard-realtime'
import { Leaderboard } from '@/components/leaderboard'
import { LeaderboardDaySelector } from '@/components/leaderboard-day-selector'
import { BottomNav } from '@/components/bottom-nav'
import { getHistoricalLeaderboardEntries, getLeaderboardEntries, getScoredLeaderboardDays } from '@/lib/data'

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
  const [{ data: { user } }, liveEntries, scoredDays] = await Promise.all([
    supabase.auth.getUser(),
    getCachedLeaderboardEntries(),
    getCachedScoredDays(),
  ])
  const selectedDay = scoredDays.find(scoredDay => scoredDay.id === day) ?? null
  const entries = selectedDay
    ? await getCachedHistoricalEntries(selectedDay.id)
    : liveEntries
  const eyebrow = selectedDay ? `As of ${selectedDay.date} - ${selectedDay.stage}` : 'Live rankings'

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            {eyebrow}
          </div>
          <div className="text-[22px] font-extrabold text-text tracking-tight">Leaderboard</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-[11px] font-semibold text-sub">{entries.length} players</div>
          <LeaderboardDaySelector days={scoredDays} selectedDayId={selectedDay?.id ?? null} />
        </div>
      </div>

      <main className="pb-24">
        {selectedDay ? (
          <Leaderboard
            entries={entries}
            currentUserId={user?.id ?? ''}
            todayModeLabel="Day"
            movementPointsLabel="day"
            todayEmptyMessage="No results scored for this selected day"
          />
        ) : (
          <LeaderboardRealtime initialEntries={entries} currentUserId={user?.id ?? ''} />
        )}
      </main>

      <BottomNav />
    </div>
  )
}
