import { unstable_cache } from 'next/cache'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { BoardFeed, type BoardPost } from '@/components/board-feed'
import { BottomNav } from '@/components/bottom-nav'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { LiveScoreStrip, type LiveMatchRow } from '@/components/live-score-strip'
import { maybeSyncLiveScores } from '@/lib/live-sync'
import { ScenarioSimulator } from '@/components/scenario-simulator'
import { getLeaderboardEntries, isFuturesLocked } from '@/lib/data'
import { withCurrentFuturesOdds } from '@/lib/pre-tournament'
import type { ScenarioFuturesPick } from '@/lib/scenario-leaderboard'
import type { LeaderboardEntry } from '@/lib/types'

// Live matches are the same for all users. 60s TTL keeps data fresh during
// active matches; revalidatePath('/board') in the live-sync flushes it sooner.
const getCachedLiveMatches = unstable_cache(
  async (): Promise<LiveMatchRow[]> => {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('matches')
      .select('id, home_team, away_team, live_status, live_score_home, live_score_away, live_minute')
      .in('live_status', ['IN_PLAY', 'PAUSED'])
      .not('published_at', 'is', null)
      .order('kickoff_time', { ascending: true })
    if (error) throw error
    return (data ?? []) as LiveMatchRow[]
  },
  ['live-matches-board'],
  { revalidate: 60 },
)

// Board posts are identical for every authenticated user — cache at the
// Next.js layer and revalidate in the background every 60 s. The Supabase
// Realtime subscription in BoardFeed keeps the client up-to-date after load.
const getBoardPosts = unstable_cache(
  async (): Promise<BoardPost[]> => {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('message_board_posts')
      .select('id, user_id, body, image_path, uploaded_media_type, media_provider, media_provider_id, media_url, media_preview_url, media_title, media_width, media_height, created_at, users(display_name, is_monkey, automation_strategy, avatar_emoji)')
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<BoardPost[]>()
    if (error) throw error
    return data ?? []
  },
  ['board-posts'],
  { revalidate: 900, tags: ['board-posts'] },
)

type BoardScenarioData = {
  entries: LeaderboardEntry[]
  picks: ScenarioFuturesPick[]
}

// Futures picks must stay hidden until the tournament market is locked. Once
// revealed, cache this shared read alongside the leaderboard and refresh it
// whenever score changes invalidate the leaderboard tag.
const getBoardScenarioData = unstable_cache(
  async (): Promise<BoardScenarioData | null> => {
    const supabase = createAdminClient()
    if (!(await isFuturesLocked(supabase))) return null

    const [entries, { data: picks, error }] = await Promise.all([
      getLeaderboardEntries(supabase),
      supabase
        .from('pre_tournament_picks')
        .select('user_id, winner_team, winner_odds, top_scorer, top_scorer_odds, winner_points, top_scorer_points'),
    ])
    if (error) throw error

    return {
      entries,
      picks: (picks ?? []).map(withCurrentFuturesOdds),
    }
  },
  ['board-scenario-data'],
  { revalidate: 300, tags: ['leaderboard'] },
)

export const metadata = {
  title: 'Message Board | Mondial Bets 2026',
  description: 'Player posts and match-day banter',
}

export default async function BoardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  after(maybeSyncLiveScores)

  const [posts, { data: profile, error: profileError }, liveMatches, scenarioData] = await Promise.all([
    getBoardPosts(),
    supabase.from('users').select('is_admin').eq('id', user.id).single(),
    getCachedLiveMatches(),
    getBoardScenarioData(),
  ])

  if (profileError) throw profileError

  return (
    <div className="min-h-screen bg-bg">
      <header className="px-4 pt-4 pb-3">
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
          Match-day chatter
        </div>
        <div className="font-display text-[22px] font-extrabold text-text tracking-tight">Message Board</div>
      </header>

      <LiveScoreStrip matches={liveMatches} />

      <main className="space-y-4 px-4 pb-28">
        {scenarioData && (
          <ScenarioSimulator
            entries={scenarioData.entries}
            picks={scenarioData.picks}
            currentUserId={user.id}
          />
        )}
        <BoardFeed initialPosts={posts} currentUserId={user.id} currentUserIsAdmin={profile.is_admin}
          giphyApiKey={process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? ''} />
      </main>

      <BottomNav />
    </div>
  )
}
