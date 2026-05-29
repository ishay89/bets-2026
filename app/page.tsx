import Link from 'next/link'
import { redirect } from 'next/navigation'
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
  if (!user) redirect('/login')

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
      .eq('user_id', user.id)
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
    <div className="min-h-screen bg-bg">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <SoccerBallLogo />
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'var(--color-text)',
                lineHeight: 1,
                textTransform: 'uppercase',
              }}
            >
              Mondial Bets
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 9,
                letterSpacing: '0.20em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
                marginTop: 2,
              }}
            >
              USA · CAN · MEX 2026
            </div>
          </div>
        </div>
        {/* Host flags */}
        <div className="flex items-center gap-1 text-base">🇺🇸🇨🇦🇲🇽</div>
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
          <div
            className="pitch-stripes rounded-2xl p-5 relative overflow-hidden"
            style={{
              background: 'var(--color-panel)',
              border: `1px solid ${picksOpen ? 'var(--border-accent)' : 'var(--border-base)'}`,
            }}
          >
            {/* Glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'var(--hero-glow)' }}
            />
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
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--color-sub)',
                  }}
                >
                  {STAGE_LABELS[todayDay.stage] ?? todayDay.stage}
                </span>
              </div>

              {picksOpen ? (
                <>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 10,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--color-sub)',
                      marginBottom: 4,
                    }}
                  >
                    Lock in
                  </div>
                  <div className="flex items-baseline gap-2">
                    {[
                      { n: String(hours).padStart(2, '0'), unit: 'HRS' },
                      { n: String(mins).padStart(2, '0'), unit: 'MIN' },
                    ].map(({ n, unit }) => (
                      <span key={unit} className="flex items-baseline gap-1">
                        <span
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 42,
                            fontWeight: 700,
                            color: 'var(--color-accent)',
                            letterSpacing: '-0.02em',
                            lineHeight: 1,
                          }}
                        >
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

              <div className="mt-4 flex gap-2">
                <Link
                  href="/predict"
                  className="flex-1 text-center rounded-xl py-3"
                  style={{
                    background: 'var(--color-accent)',
                    color: '#000',
                    fontFamily: 'var(--font-display)',
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                  }}
                >
                  {picksOpen ? 'Make Picks →' : 'View Picks →'}
                </Link>
                <div
                  className="font-bold rounded-xl px-4 py-3"
                  style={{
                    background: 'var(--color-elev)',
                    border: '1px solid var(--border-base)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 13,
                    letterSpacing: '0.06em',
                    color: 'var(--color-sub)',
                  }}
                >
                  {todayMatches.length} matches
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                color: 'var(--color-sub)',
                letterSpacing: '0.06em',
              }}
            >
              No matches scheduled today
            </div>
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

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
        >
          {miniEntries.map((entry, i, arr) => {
            const isMe = entry.id === user?.id
            const av = getAvatar(entry)
            const rankColor = rankColors[entry._rank]
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3"
                style={{
                  padding: '12px 14px',
                  background: isMe ? 'var(--color-accent-soft)' : 'transparent',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  borderLeft: isMe ? '3px solid var(--color-accent)' : '3px solid transparent',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 15,
                    fontWeight: 700,
                    width: 24,
                    color: rankColor ?? (isMe ? 'var(--color-accent)' : 'var(--color-muted)'),
                    letterSpacing: '0.02em',
                  }}
                >
                  {entry._rank}
                </div>
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{ width: 28, height: 28, background: 'var(--color-elev)', fontSize: 14 }}
                >
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
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      width: 40,
                      flexShrink: 0,
                      color: 'var(--color-sub)',
                    }}
                  >
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
function getAvatar(entry: LeaderboardEntry): string {
  if (entry.automation_strategy === 'max') return '▲'
  if (entry.automation_strategy === 'mid') return '◆'
  if (entry.automation_strategy === 'min') return '▼'
  if (entry.is_monkey) return '🐒'
  return AVATARS[entry.display_name.charCodeAt(0) % AVATARS.length]
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
