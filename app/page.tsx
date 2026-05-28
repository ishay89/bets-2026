import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/bottom-nav'
import type { LeaderboardEntry } from '@/lib/types'
import { PRE_TOURNAMENT_PATH, hasCompletedPreTournamentPick } from '@/lib/pre-tournament'

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

  const [{ data: entries }, { data: todayDay }, { data: preTournamentPick }] = await Promise.all([
    supabase.from('leaderboard').select('*').returns<LeaderboardEntry[]>(),
    supabase
      .from('match_days')
      .select('id, stage, date, lock_time, matches(home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away)')
      .gte('date', new Date().toISOString().slice(0, 10))
      .not('published_at', 'is', null)
      .order('date')
      .limit(1)
      .single(),
    supabase
      .from('pre_tournament_picks')
      .select('winner_team, top_scorer')
      .eq('user_id', user!.id)
      .maybeSingle(),
  ])

  const todayMatches: HomeMatchRow[] = (todayDay as { matches: HomeMatchRow[] } | null)?.matches ?? []
  const hasEntryPick = hasCompletedPreTournamentPick(preTournamentPick)

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
  const miniEntries: (LeaderboardEntry & { _rank: number })[] = [
    ...top3.map((e, i) => ({ ...e, _rank: i + 1 })),
    ...(myEntry && myRank && myRank > 3 ? [{ ...myEntry, _rank: myRank }] : []),
  ]

  const rankColors: Record<number, string> = {
    1: 'var(--color-gold)',
    2: 'var(--color-silver)',
    3: 'var(--color-bronze)',
  }

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
        {!hasEntryPick && (
          <Link
            href={PRE_TOURNAMENT_PATH}
            className="block rounded-2xl p-4"
            style={{
              background: 'var(--color-panel)',
              border: '1px solid var(--border-accent)',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--color-accent)',
              }}
            >
              Entry required
            </div>
            <div className="mt-1 text-text text-base font-extrabold tracking-tight">
              Pick champion and top scorer
            </div>
            <div className="mt-1 text-sub text-sm">
              Complete these one-time picks before making daily predictions.
            </div>
          </Link>
        )}

        {/* ── Countdown hero ── */}
        {todayDay ? (
          <div className="superstar-panel p-[18px] min-h-[238px] flex items-end">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[10px] px-2.5 py-1 rounded-full font-bold"
                  style={{
                    color: picksOpen ? 'var(--color-accent)' : 'var(--color-muted)',
                    background: picksOpen ? 'var(--color-accent-soft)' : 'var(--color-elev)',
                    border: `1px solid ${picksOpen ? 'var(--border-accent)' : 'var(--border-base)'}`,
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                  }}
                >
                  {picksOpen ? '⏱ Open' : '🔒 Locked'}
                </span>
                <div className="text-[11px] font-semibold text-sub ml-3" style={{ fontFamily: 'var(--font-mono)' }}>
                  {STAGE_LABELS[todayDay.stage] ?? todayDay.stage}
                </span>
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
                        <span
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 10,
                            letterSpacing: '0.14em',
                            color: 'var(--color-muted)',
                            marginRight: 4,
                          }}
                        >
                          {unit}
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                    color: 'var(--color-sub)',
                    letterSpacing: '0.04em',
                  }}
                >
                  Predictions locked for today
                </div>
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

        {/* ── Mini leaderboard ── */}
        <div className="flex items-center justify-between px-0.5">
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 10,
              letterSpacing: '0.20em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
            }}
          >
            🏆 Standings · {allEntries.length} players
          </span>
          <Link
            href="/leaderboard"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              letterSpacing: '0.08em',
              color: 'var(--color-sub)',
              textDecoration: 'none',
            }}
          >
            See all →
          </Link>
        </div>
        <div className="bet-card overflow-hidden">
          {miniEntries.map((entry, i, arr) => {
            const isMe = entry.id === user?.id
            const av = getAvatar(entry.display_name, entry.is_monkey)
            const rankColor = rankColors[entry._rank]
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3"
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
                <div
                  className="flex-1"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: 700,
                    color: isMe ? 'var(--color-accent)' : 'var(--color-text)',
                  }}
                >
                  {isMe ? 'You' : entry.display_name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--color-text)',
                  }}
                >
                  {entry.total_points.toFixed(1)}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Today's matches ── */}
        {todayMatches.length > 0 && (
          <>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 10,
                letterSpacing: '0.20em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
                paddingLeft: 2,
              }}
            >
              ⚽ Today · {todayMatches.length} {todayMatches.length === 1 ? 'match' : 'matches'}
            </div>
            <div className="flex flex-col gap-2">
              {todayMatches.map((m, i) => (
                <div key={i} className="bet-card flex items-center gap-2.5 px-3 py-2.5">
                  <div className="text-[11px] font-semibold w-[38px] shrink-0 text-sub"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                    {formatTime(m.kickoff_time)}
                  </div>
                  <span className="text-base shrink-0">{getFlag(m.home_team)}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      color: 'var(--color-dim)',
                    }}
                  >
                    VS
                  </span>
                  <span className="text-base shrink-0">{getFlag(m.away_team)}</span>
                  <div className="flex-1" />
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--color-muted)',
                    }}
                  >
                    {m.odds_home?.toFixed(2)} · {m.odds_draw?.toFixed(2)} · {m.odds_away?.toFixed(2)}
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

function SoccerBallLogo() {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'var(--color-accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {/* Soccer ball icon */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#000" strokeWidth="1.5" />
        {/* Center pentagon patch */}
        <polygon points="12,7 14.8,9 13.8,12.2 10.2,12.2 9.2,9" fill="#000" />
        {/* Side lines to pentagon vertices */}
        <line x1="12" y1="3" x2="12" y2="7" stroke="#000" strokeWidth="1.2" />
        <line x1="14.8" y1="9" x2="18" y2="7.5" stroke="#000" strokeWidth="1.2" />
        <line x1="13.8" y1="12.2" x2="16.5" y2="15" stroke="#000" strokeWidth="1.2" />
        <line x1="10.2" y1="12.2" x2="7.5" y2="15" stroke="#000" strokeWidth="1.2" />
        <line x1="9.2" y1="9" x2="6" y2="7.5" stroke="#000" strokeWidth="1.2" />
      </svg>
    </div>
  )
}

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage',
  r16: 'Round of 16',
  qf: 'Quarter Finals',
  sf: 'Semi Finals',
  '3rd': 'Third Place',
  final: 'Final',
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
  } catch { return '—' }
}
