import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/bottom-nav'
import type { LeaderboardEntry } from '@/lib/types'

type HomeMatchRow = {
  home_team: string
  away_team: string
  kickoff_time: string | null
  odds_home: number
  odds_draw: number
  odds_away: number
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: entries }, { data: todayDay }] = await Promise.all([
    supabase.from('leaderboard').select('*').returns<LeaderboardEntry[]>(),
    supabase
      .from('match_days')
      .select('id, stage, date, lock_time, matches(home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away)')
      .gte('date', new Date().toISOString().slice(0, 10))
      .not('published_at', 'is', null)
      .order('date')
      .limit(1)
      .single(),
  ])

  const todayMatches: HomeMatchRow[] = (todayDay as { matches: HomeMatchRow[] } | null)?.matches ?? []

  let minutesUntilLock: number | null = null
  if (todayDay?.lock_time) {
    // eslint-disable-next-line react-hooks/purity
    const diff = new Date(todayDay.lock_time).getTime() - Date.now()
    minutesUntilLock = Math.max(0, Math.floor(diff / 60000))
  }
  const picksOpen = minutesUntilLock != null && minutesUntilLock > 0
  const hours = minutesUntilLock != null ? Math.floor(minutesUntilLock / 60) : 0
  const mins = minutesUntilLock != null ? minutesUntilLock % 60 : 0

  const allEntries = entries ?? []
  const top3 = allEntries.slice(0, 3)
  const myEntry = allEntries.find(e => e.id === user?.id)
  const myRank = myEntry ? allEntries.indexOf(myEntry) + 1 : null
  // Show top 3 + user if outside top 3
  const miniEntries: (LeaderboardEntry & { _rank: number })[] = [
    ...top3.map((e, i) => ({ ...e, _rank: i + 1 })),
    ...(myEntry && myRank && myRank > 3 ? [{ ...myEntry, _rank: myRank }] : []),
  ]

  const rankColors: Record<number, string> = { 1: '#f5c441', 2: '#aab4cd', 3: '#d18a4d' }

  return (
    <div className="app-shell bg-bg">
      {/* Header */}
      <header className="stadium-header flex items-center justify-between px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <div className="ball-mark w-9 h-9 rounded-lg shrink-0" aria-hidden="true" />
          <div>
            <div className="brand-wordmark text-[15px] leading-none">Mondial Bets</div>
            <div className="text-[10px] font-bold uppercase text-sub">Friends pool · World Cup 2026</div>
          </div>
        </div>
        <div className="odds-chip px-2.5 py-1 text-[11px]">LIVE SLIP</div>
      </header>

      <main className="px-4 pb-28 space-y-4">
        {/* Countdown hero */}
        {todayDay ? (
          <div className="superstar-panel p-[18px] min-h-[238px] flex items-end">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.6px] px-2 py-1 rounded-full"
                  style={{
                    color: picksOpen ? 'var(--color-accent)' : 'var(--color-muted)',
                    background: picksOpen ? 'rgba(0,217,126,0.14)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${picksOpen ? 'rgba(0,217,126,0.32)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                  {picksOpen ? '⏰ Picks open' : '🔒 Picks locked'}
                </span>
                <div className="text-[11px] font-semibold text-sub ml-3" style={{ fontFamily: 'var(--font-mono)' }}>
                  {STAGE_LABELS[todayDay.stage] ?? todayDay.stage}
                </div>
              </div>

              {picksOpen ? (
                <>
                  <div className="text-[11px] font-semibold text-sub mb-1.5">Group chat deadline</div>
                  <div className="flex items-baseline gap-1">
                    {[String(hours).padStart(2, '0'), String(mins).padStart(2, '0')].map((n, i) => (
                      <span key={i} className="flex items-baseline gap-0.5">
                        <span className="font-semibold leading-none"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 34, color: 'var(--color-accent)', letterSpacing: 0 }}>
                          {n}
                        </span>
                        <span className="text-[10px] font-bold tracking-wide mr-1 text-muted">
                          {['HRS', 'MIN'][i]}
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-[13px] font-semibold text-sub">Predictions locked for today</div>
              )}

              <div className="mt-3 flex gap-2">
                <Link href="/predict"
                  className="flex-1 text-center font-extrabold text-[13px] rounded-lg py-2.5 text-black"
                  style={{ background: 'var(--color-accent)' }}>
                  {picksOpen ? 'Build my slip' : 'View my slip'}
                </Link>
                <div className="font-bold text-[13px] rounded-lg px-3.5 py-2.5 text-text"
                  style={{ background: 'rgba(6,16,10,0.82)', border: '1px solid rgba(246,248,232,0.12)' }}>
                  {todayMatches.length} matches
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bet-card p-4 text-center">
            <div className="font-bold text-text text-sm">No matches scheduled today</div>
          </div>
        )}

        {/* Mini leaderboard */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-muted">
            Leaderboard · {allEntries.length} players
          </span>
          <Link href="/leaderboard" className="text-[11px] font-semibold text-sub">See all →</Link>
        </div>
        <div className="bet-card overflow-hidden">
          {miniEntries.map((entry, i, arr) => {
            const isMe = entry.id === user?.id
            const av = getAvatar(entry.display_name, entry.is_monkey)
            return (
              <div key={entry.id} className="flex items-center gap-3"
                style={{
                  padding: '12px 14px',
                  background: isMe ? 'rgba(200,240,92,0.08)' : 'transparent',
                  borderBottom: i < arr.length - 1 ? '1px solid rgba(246,248,232,0.08)' : 'none',
                  borderLeft: isMe ? '2px solid var(--color-accent)' : '2px solid transparent',
                }}>
                <div className="font-bold text-[14px] w-[22px]"
                  style={{ fontFamily: 'var(--font-mono)', color: rankColors[entry._rank] ?? (isMe ? 'var(--color-accent)' : 'var(--color-muted)') }}>
                  {entry._rank}
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
                  style={{ background: 'var(--color-elev)', border: '1px solid rgba(246,248,232,0.08)', fontSize: 14 }}>
                  {av}
                </div>
                <div className="flex-1 font-bold text-[13.5px]"
                  style={{ color: isMe ? 'var(--color-accent)' : 'var(--color-text)' }}>
                  {isMe ? 'You' : entry.display_name}
                </div>
                <div className="font-bold text-[14px] w-12 text-right"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                  {entry.total_points.toFixed(1)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Today's matches */}
        {todayMatches.length > 0 && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5 text-muted">
              Today · {todayMatches.length} {todayMatches.length === 1 ? 'match' : 'matches'}
            </div>
            <div className="flex flex-col gap-2">
              {todayMatches.map((m, i) => (
                <div key={i} className="bet-card flex items-center gap-2.5 px-3 py-2.5">
                  <div className="text-[11px] font-semibold w-[38px] shrink-0 text-sub"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                    {formatTime(m.kickoff_time)}
                  </div>
                  <span className="text-base shrink-0">{getFlag(m.home_team)}</span>
                  <span className="text-[11px] font-bold text-muted">vs</span>
                  <span className="text-base shrink-0">{getFlag(m.away_team)}</span>
                  <div className="flex-1" />
                  <div className="text-[10px] font-semibold text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                    {m.odds_home?.toFixed(2)} / {m.odds_draw?.toFixed(2)} / {m.odds_away?.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

const AVATARS = ['🦁','🐯','🦊','🐺','🦅','🐻','🐼','🦝','🦄','🐉','🦋','🌟','🔥','⚡','🎯']
function getAvatar(name: string, isMonkey: boolean): string {
  if (isMonkey) return '🐒'
  return AVATARS[name.charCodeAt(0) % AVATARS.length]
}

const FLAGS: Record<string, string> = {
  France: '🇫🇷', Spain: '🇪🇸', Brazil: '🇧🇷', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Argentina: '🇦🇷', Netherlands: '🇳🇱', Portugal: '🇵🇹', Germany: '🇩🇪',
  Italy: '🇮🇹', Belgium: '🇧🇪', Croatia: '🇭🇷', Uruguay: '🇺🇾',
  Mexico: '🇲🇽', USA: '🇺🇸', Canada: '🇨🇦', Japan: '🇯🇵',
  'South Korea': '🇰🇷', Morocco: '🇲🇦',
}
function getFlag(name: string): string { return FLAGS[name] ?? '🏳️' }

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('he-IL', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
    })
  } catch {
    return '—'
  }
}
