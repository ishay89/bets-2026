import { createAdminClient, createClient, createClientWithToken } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { BottomNav } from '@/components/bottom-nav'
import { isMatchLocked } from '@/lib/lock'
import { getAvatar, getAutomationLabel, getFlagUrl, ordinal, stageLabel } from '@/lib/display'
import {
  getLeaderboardEntries,
  getMatchDaysWithUserData,
  getUserFuturesPick,
  isFuturesLocked,
  type HistoryMatchDay,
} from '@/lib/data'
import { formatAppDate } from '@/lib/time'

// Same cache key as /leaderboard, so this reuses that entry — totals are
// identical for every viewer.
const getCachedLeaderboardEntries = unstable_cache(
  () => getLeaderboardEntries(createAdminClient()),
  ['leaderboard-entries'],
  { revalidate: 300, tags: ['leaderboard'] },
)

// Cached PER VIEWER (keyed on their access token), not shared globally — this
// still runs through the viewer's own RLS scope (token-built client, no admin
// bypass), so the database keeps doing the real filtering of unlocked rows.
// It still kills the original fan-out: this fetch takes no target userId, so
// one session's burst of prefetched profile/H2H pages all hit this single
// entry instead of re-querying per page.
const getCachedMatchDaysForViewer = unstable_cache(
  (_viewerId: string, accessToken: string) =>
    getMatchDaysWithUserData(createClientWithToken(accessToken)),
  ['match-days-user-data'],
  { revalidate: 60, tags: ['match-days'] },
)

// Caches the DERIVED view model, not just the raw fetch — Vercel's Active CPU
// billing excludes I/O wait (the DB round-trip above), so the actual billed
// cost per request is buildDays()'s loop over every match day. Without this,
// that loop re-runs on every request even when getCachedMatchDaysForViewer
// hits. nowBucket rounds down to the minute so the key stays stable within
// the same 60s window as the underlying data; rounding down only ever delays
// a lock transition by up to 60s, never reveals a pick early.
const getCachedProfileDayVMs = unstable_cache(
  async (viewerId: string, targetId: string, accessToken: string, nowBucket: number) => {
    const days = await getCachedMatchDaysForViewer(viewerId, accessToken)
    return buildDays(days, targetId, nowBucket)
  },
  ['profile-day-vms'],
  { revalidate: 60, tags: ['match-days'] },
)

export const metadata = { title: 'Player history | Mondial Bets 2026', description: 'A player’s locked predictions' }

const PICK_LABELS: Record<string, string> = { '1': '1', X: 'X', '2': '2' }

// Module-level helper keeps the impure Date.now() out of the component body,
// satisfying the react-compiler purity lint rule (mirrors app/h2h/[opponentId]).
function nowMs(): number {
  return Date.now()
}

type DayVM = {
  id: string
  date: string
  stage: string
  points: number
  matches: {
    id: string
    home: string
    away: string
    pick: string
    pickLabel: string
    result: string | null
    points: number
    correct: boolean | null
  }[]
  pikanteria: {
    id: string
    question: string
    pickLabel: string | null
    result: string | null
    points: number
    correct: boolean | null
  }[]
}

// Pure transform: keep ONLY the target player's locked picks/answers. Unlocked
// items are dropped here (not just by RLS) so that an admin viewer — whose RLS
// can read unlocked rows — still never sees another player's open predictions.
function buildDays(days: HistoryMatchDay[], targetId: string, now: number): DayVM[] {
  const out: DayVM[] = []

  for (const day of days) {
    const matches: DayVM['matches'] = []
    for (const m of day.matches.toSorted(
      (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime(),
    )) {
      if (!isMatchLocked(m, now)) continue
      const pred = m.predictions.find(p => p.user_id === targetId)
      if (!pred) continue
      matches.push({
        id: m.id,
        home: m.home_team,
        away: m.away_team,
        pick: pred.pick,
        pickLabel: PICK_LABELS[pred.pick] ?? pred.pick,
        result: m.result,
        points: pred.points ?? 0,
        correct: m.result !== null ? pred.pick === m.result : null,
      })
    }

    const pikanteria: DayVM['pikanteria'] = []
    for (const pk of day.pikanteria) {
      if (!pk.locked) continue
      const ans = pk.pikanteria_answers.find(a => a.user_id === targetId)
      if (!ans) continue
      const labelFor = (pick: string | null): string | null => {
        if (pick === '1') return pk.label_1
        if (pick === '2') return pk.label_2
        if (pick === 'X') return pk.label_x
        return null
      }
      pikanteria.push({
        id: pk.id,
        question: pk.question,
        pickLabel: labelFor(ans.pick),
        result: pk.result,
        points: ans.points ?? 0,
        correct: pk.result !== null ? ans.pick === pk.result : null,
      })
    }

    if (matches.length === 0 && pikanteria.length === 0) continue
    const points = [
      ...matches.map(m => m.points),
      ...pikanteria.map(p => p.points),
    ].reduce((a, b) => a + b, 0)
    out.push({ id: day.id, date: day.date, stage: day.stage, points, matches, pikanteria })
  }

  return out
}

export default async function PlayerHistoryPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const [{ userId }, supabase] = await Promise.all([params, createClient()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Viewing your own row → your full history (which includes open picks).
  if (userId === user.id) redirect('/history')

  // getSession() only to grab the access token for the per-viewer cache below
  // — getUser() above remains the authoritative identity check.
  const { data: { session } } = await supabase.auth.getSession()

  const now = nowMs()
  const nowBucket = Math.floor(now / 60_000) * 60_000

  const [profileRes, entries, dayVMs, futuresLocked, futuresPick] = await Promise.all([
    supabase
      .from('users')
      .select('id, display_name, avatar_emoji, is_monkey, automation_strategy, status')
      .eq('id', userId)
      .maybeSingle(),
    getCachedLeaderboardEntries(),
    session
      ? getCachedProfileDayVMs(user.id, userId, session.access_token, nowBucket)
      : getMatchDaysWithUserData(supabase).then(days => buildDays(days, userId, now)),
    isFuturesLocked(supabase),
    getUserFuturesPick(supabase, userId),
  ])

  // RLS only exposes approved profiles to other players; bail out otherwise.
  const profile = profileRes.data
  if (!profile || profile.status !== 'approved') notFound()

  const entry = entries.find(e => e.id === userId) ?? null
  const rank = entries.findIndex(e => e.id === userId) + 1
  const automationLabel = getAutomationLabel(profile)
  const avatar = getAvatar(profile)

  // Champion / top scorer stay hidden until futures lock — same rule the
  // player's own /predict reveal uses. pre_tournament_picks has no lock-aware
  // RLS, so this gate is the only thing protecting open futures picks.
  const showFutures = futuresLocked && futuresPick !== null

  const allPicks: ('W' | 'L')[] = []
  for (const day of dayVMs.toReversed()) {
    for (const m of day.matches) {
      if (m.correct !== null) allPicks.push(m.correct ? 'W' : 'L')
    }
  }
  const streak = allPicks.slice(-15)
  const wins = streak.filter(o => o === 'W').length

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
            Locked picks · futures &amp; pikanteria
          </div>
          <div className="font-display text-[22px] font-extrabold text-text tracking-tight truncate">History</div>
        </div>
        <Link
          href="/leaderboard"
          className="shrink-0 text-[12px] font-semibold"
          style={{ color: 'var(--color-sub)', textDecoration: 'none' }}
        >
          ← Board
        </Link>
      </div>

      <main className="px-4 pb-28 space-y-4">
        {/* Player hero */}
        <div className="rounded-[14px] p-4"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center rounded-full text-2xl shrink-0"
              style={{ width: 52, height: 52, background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}>
              {avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[18px] tracking-tight text-text truncate">{profile.display_name}</div>
              {automationLabel && (
                <div className="text-[11px] text-muted mt-0.5">{automationLabel}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold text-[24px]"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                {(entry?.total_points ?? 0).toFixed(2)}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                pts · {rank > 0 ? ordinal(rank) : '—'}
              </div>
            </div>
          </div>
          <Link
            href={`/h2h/${userId}`}
            className="mt-4 block text-center text-[11px] font-bold py-2 rounded-lg"
            style={{ color: 'var(--color-muted)', border: '1px solid var(--border-base)', background: 'var(--color-elev)', textDecoration: 'none' }}
          >
            ⚔️ Compare head-to-head →
          </Link>
        </div>

        {/* Streak */}
        {streak.length > 0 && (
          <div className="rounded-[14px] p-4" style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-muted">
                Last {streak.length} picks
              </span>
              <span className="text-[11px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-sub)' }}>
                {wins}W · {streak.length - wins}L · {Math.round(wins / streak.length * 100)}%
              </span>
            </div>
            <div className="flex gap-1">
              {streak.map((o, i) => (
                <div key={i}
                  className="flex-1 h-7 rounded flex items-center justify-center text-[10px] font-extrabold"
                  style={{
                    background: o === 'W' ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
                    border: `1px solid ${o === 'W' ? 'var(--border-accent)' : 'var(--border-danger)'}`,
                    color: o === 'W' ? 'var(--color-accent)' : 'var(--color-danger)',
                  }}
                >{o}</div>
              ))}
            </div>
          </div>
        )}

        {/* Futures (only once locked) */}
        {showFutures && futuresPick && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5 text-muted">
              🏆 Futures
            </div>
            <div className="rounded-[14px] p-4 space-y-3"
              style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-sub">🏆 Champion</span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
                    {getFlagUrl(futuresPick.winner_team) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={getFlagUrl(futuresPick.winner_team)!} alt={futuresPick.winner_team} width={20} height={13} style={{ borderRadius: 2, objectFit: 'cover' }} />
                    ) : null}
                    {futuresPick.winner_team}
                  </span>
                  {futuresPick.winner_points !== null && (
                    <span className="font-bold text-[12px]"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gold)' }}>
                      +{futuresPick.winner_points.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between py-1"
                style={{ borderTop: '1px solid var(--border-base)' }}>
                <span className="text-[12px] text-sub">⚽ Top scorer</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-text">{futuresPick.top_scorer}</span>
                  {futuresPick.top_scorer_points !== null && (
                    <span className="font-bold text-[12px]"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                      +{futuresPick.top_scorer_points.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5 text-muted">By day</div>

        {dayVMs.length === 0 && (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-text font-semibold">No locked picks yet</div>
            <div className="text-[12px] text-muted mt-1">
              Predictions appear here once the match or pikanteria locks.
            </div>
          </div>
        )}

        {dayVMs.map(day => (
          <div key={day.id} className="rounded-[14px] overflow-hidden"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--border-base)' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--color-text)' }}>{formatAppDate(day.date)}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)', marginTop: 2 }}>
                  {stageLabel(day.stage)}
                </div>
              </div>
              <div className="font-bold text-[18px]"
                style={{ fontFamily: 'var(--font-mono)', color: day.points > 0 ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                +{day.points.toFixed(2)}
              </div>
            </div>
            <div className="px-4 py-2 space-y-1.5">
              {day.matches.map(m => (
                <div key={m.id} className="flex items-center gap-2 py-1.5"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center gap-1 text-[12px] text-sub flex-1 min-w-0">
                    {getFlagUrl(m.home) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={getFlagUrl(m.home)!} alt={m.home} width={18} height={12} style={{ borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
                    ) : null}
                    <span className="truncate">{m.home} vs {m.away}</span>
                    {getFlagUrl(m.away) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={getFlagUrl(m.away)!} alt={m.away} width={18} height={12} style={{ borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded"
                      style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)', color: 'var(--color-text)' }}>
                      {m.pickLabel}
                    </span>
                    <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                      {m.result !== null
                        ? m.correct
                          ? `+${m.points.toFixed(2)}`
                          : `✗ (${m.result})`
                        : 'pending'}
                    </span>
                    {m.correct !== null && (
                      <span className="text-[10px] font-extrabold w-4 text-center"
                        style={{ color: m.correct ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                        {m.correct ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {day.pikanteria.map(p => (
                <div key={p.id} className="flex items-center gap-2 py-1.5"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <span className="text-[11px] flex-1" style={{ color: 'var(--color-amber)' }}>
                    🌶️ {p.question}
                  </span>
                  <span className="text-[11px] text-text">{p.pickLabel ?? '?'}</span>
                  {p.correct !== null && (
                    <span className="text-[10px] font-extrabold w-4 text-center"
                      style={{ color: p.correct ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                      {p.correct ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>

      <BottomNav />
    </div>
  )
}
