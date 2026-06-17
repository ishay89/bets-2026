import { unstable_cache } from 'next/cache'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { BoardFeed, type BoardPost } from '@/components/board-feed'
import { BottomNav } from '@/components/bottom-nav'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { LiveScoreStrip, type LiveMatchRow } from '@/components/live-score-strip'
import { maybeSyncLiveScores } from '@/lib/live-sync'

// Live matches are the same for all users. 60s TTL keeps data fresh during
// active matches; revalidatePath('/board') in the live-sync flushes it sooner.
const getCachedLiveMatches = unstable_cache(
  async (): Promise<LiveMatchRow[]> => {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('matches')
      .select('id, home_team, away_team, live_status, live_score_home, live_score_away')
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

export const metadata = {
  title: 'Message Board | Mondial Bets 2026',
  description: 'Player posts and match-day banter',
}

export default async function BoardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  after(maybeSyncLiveScores)

  const [posts, { data: profile, error: profileError }, liveMatches] = await Promise.all([
    getBoardPosts(),
    supabase.from('users').select('is_admin').eq('id', user.id).single(),
    getCachedLiveMatches(),
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

      <main className="px-4 pb-28">
        <BoardFeed initialPosts={posts} currentUserId={user.id} currentUserIsAdmin={profile.is_admin}
          giphyApiKey={process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? ''} />
      </main>

      <BottomNav />
    </div>
  )
}
