import { redirect } from 'next/navigation'
import { AiRecapFeed, type AiSocialPost } from '@/components/board-feed'
import { BottomNav } from '@/components/bottom-nav'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'AI Recaps | Mondial Bets 2026',
  description: 'AI match-day recaps and commentary',
}

export default async function RecapsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: aiPosts, error } = await supabase
    .from('ai_social_posts')
    .select('id, title, body, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<AiSocialPost[]>()

  if (error) throw error

  return (
    <div className="min-h-screen bg-bg">
      <header className="px-4 pt-4 pb-3">
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
          Codex press box
        </div>
        <div className="text-[22px] font-extrabold text-text tracking-tight">AI Recaps</div>
      </header>

      <main className="px-4 pb-28">
        <AiRecapFeed posts={aiPosts ?? []} />
      </main>

      <BottomNav />
    </div>
  )
}
