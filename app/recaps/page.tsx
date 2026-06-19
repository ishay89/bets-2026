import { redirect } from 'next/navigation'
import { AiRecapFeed, RECAP_WINDOW_MS, type AiSocialPost } from '@/components/board-feed'
import { BottomNav } from '@/components/bottom-nav'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'AI Recaps | Mondial Bets 2026',
  description: 'AI match-day recaps and commentary',
}

// Module-level helper keeps the impure Date.now() out of the component body,
// satisfying the react-compiler purity lint rule (mirrors app/h2h/[opponentId]).
function nowMs(): number {
  return Date.now()
}

export default async function RecapsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const windowStart = new Date(nowMs() - RECAP_WINDOW_MS).toISOString()
  const { data: aiPosts, error } = await supabase
    .from('ai_social_posts')
    .select('id, title, body, created_at')
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .returns<AiSocialPost[]>()

  if (error) throw error

  return (
    <div className="min-h-screen bg-bg">
      <header className="px-4 pt-4 pb-3">
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
          Codex press box
        </div>
        <div className="font-display text-[22px] font-extrabold text-text tracking-tight">AI Recaps</div>
      </header>

      <main className="px-4 pb-28">
        <AiRecapFeed posts={aiPosts ?? []} initialWindowStart={windowStart} />
      </main>

      <BottomNav />
    </div>
  )
}
