import { createClient } from '@/lib/supabase/server'
import { LeaderboardRealtime } from '@/components/leaderboard-realtime'
import { BottomNav } from '@/components/bottom-nav'
import { getLeaderboardEntries } from '@/lib/data'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const entries = await getLeaderboardEntries(supabase)

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            Live rankings
          </div>
          <div className="text-[22px] font-extrabold text-text tracking-tight">Leaderboard</div>
        </div>
        <div className="text-[11px] font-semibold text-sub">{entries.length} players</div>
      </div>

      <main className="pb-24">
        <LeaderboardRealtime initialEntries={entries} currentUserId={user?.id ?? ''} />
      </main>

      <BottomNav />
    </div>
  )
}
