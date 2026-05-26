import { createClient } from '@/lib/supabase/server'
import { Leaderboard } from '@/components/leaderboard'
import { BottomNav } from '@/components/bottom-nav'
import type { LeaderboardEntry } from '@/lib/types'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: entries } = await supabase
    .from('leaderboard')
    .select('*')
    .returns<LeaderboardEntry[]>()

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface px-4 py-3 flex justify-between items-center sticky top-0 z-10">
        <span className="text-accent font-black text-lg">⚽ MONDIAL 2026</span>
        <span className="text-xs text-muted">{entries?.length ?? 0} players</span>
      </header>
      <main className="pt-2">
        <Leaderboard entries={entries ?? []} currentUserId={user?.id ?? ''} />
      </main>
      <BottomNav />
    </div>
  )
}
