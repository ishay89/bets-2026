import { createClient } from '@/lib/supabase/server'
import { LeaderboardRealtime } from '@/components/leaderboard-realtime'
import { BottomNav } from '@/components/bottom-nav'
import type { LeaderboardEntry } from '@/lib/types'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: entries } = await supabase
    .from('leaderboard')
    .select('*')
    .returns<LeaderboardEntry[]>()

  return (
    <div className="app-shell bg-bg">
      <div className="stadium-header px-4 pt-4 pb-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            Live rankings
          </div>
          <div className="brand-wordmark text-[24px]">Friend table</div>
        </div>
        <div className="odds-chip px-2.5 py-1 text-[11px]">{entries?.length ?? 0} players</div>
      </div>

      <main className="pb-24">
        <LeaderboardRealtime initialEntries={entries ?? []} currentUserId={user?.id ?? ''} />
      </main>

      <BottomNav />
    </div>
  )
}
