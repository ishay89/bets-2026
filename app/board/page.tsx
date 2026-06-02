import { redirect } from 'next/navigation'
import { BoardFeed, type AiSocialPost, type BoardPost } from '@/components/board-feed'
import { BottomNav } from '@/components/bottom-nav'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Message Board | Mondial Bets 2026',
  description: 'Player posts and match-day banter',
}

export default async function BoardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: posts, error }, { data: aiPosts, error: aiPostsError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from('message_board_posts')
      .select('id, user_id, body, image_path, created_at, users(display_name, is_monkey, automation_strategy)')
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<BoardPost[]>(),
    supabase
      .from('ai_social_posts')
      .select('id, title, body, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<AiSocialPost[]>(),
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single(),
  ])

  if (error) throw error
  if (aiPostsError) throw aiPostsError
  if (profileError) throw profileError

  return (
    <div className="min-h-screen bg-bg">
      <header className="px-4 pt-4 pb-3">
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
          Match-day chatter
        </div>
        <div className="text-[22px] font-extrabold text-text tracking-tight">Message Board</div>
      </header>

      <main className="px-4 pb-28">
        <BoardFeed initialPosts={posts ?? []} initialAiPosts={aiPosts ?? []}
          currentUserId={user.id} currentUserIsAdmin={profile.is_admin} />
      </main>

      <BottomNav />
    </div>
  )
}
