import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/bottom-nav'
import { getLeaderboardEntries } from '@/lib/data'
import { ordinal, getAvatar } from '@/lib/display'
import { AvatarEmojiPicker } from '@/components/avatar-emoji-picker'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata = { title: 'Profile | Mondial Bets 2026', description: 'Your profile and stats' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: pick }, { data: predictions }, { data: pikaAnswers }] =
    await Promise.all([
      supabase.from('users').select('display_name, is_admin, avatar_emoji').eq('id', user.id).single(),
      supabase.from('pre_tournament_picks').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('predictions').select('points').eq('user_id', user.id),
      supabase.from('pikanteria_answers').select('points').eq('user_id', user.id),
    ])

  const matchPoints = (predictions ?? []).reduce((s, p) => s + (p.points ?? 0), 0)
  const pikaPoints = (pikaAnswers ?? []).reduce((s, a) => s + (a.points ?? 0), 0)
  const preWinner = pick?.winner_points ?? 0
  const preScorer = pick?.top_scorer_points ?? 0
  const total = matchPoints + pikaPoints + preWinner + preScorer

  const allEntries = await getLeaderboardEntries(supabase)
  const rank = allEntries.findIndex(e => e.id === user.id) + 1

  const name = profile?.display_name ?? 'You'
  const savedEmoji = profile?.avatar_emoji ?? null
  const av = getAvatar({ display_name: name, avatar_emoji: savedEmoji })

  const rows = [
    { label: 'Match predictions', value: matchPoints, color: 'var(--color-text)' },
    { label: '🌶️ Pikanteria', value: pikaPoints, color: 'var(--color-amber)' },
    { label: '🏆 Pre-tournament bonus', value: preWinner + preScorer, color: 'var(--color-gold)' },
  ]
  const maxVal = Math.max(...rows.map(r => r.value), 1)

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-3">
        <div className="font-display text-[22px] font-extrabold text-text tracking-tight">Your stats</div>
      </div>

      <main className="px-4 pb-28 space-y-4">
        {/* Hero card */}
        <div className="rounded-[14px] p-4"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          <div className="flex items-center gap-4">
            <AvatarEmojiPicker currentAvatar={av} savedEmoji={savedEmoji} />
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[18px] tracking-tight text-text truncate">{name}</div>
              <div className="text-[11px] text-sub mt-0.5">{user?.email}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold text-[24px]"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                {total.toFixed(2)}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>pts · {rank > 0 ? ordinal(rank) : '—'}</div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { label: 'Match pts', value: matchPoints.toFixed(2) },
              { label: 'Pikanteria', value: pikaPoints.toFixed(2) },
              { label: 'Pre-tourney', value: (preWinner + preScorer).toFixed(2) },
            ].map(s => (
              <div key={s.label} className="rounded-[10px] p-3"
                style={{ background: 'var(--color-elev)' }}>
                <div className="font-bold text-[16px] text-text" style={{ fontFamily: 'var(--font-mono)' }}>{s.value}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Head-to-head entry */}
        <Link href="/h2h"
          className="flex items-center justify-between rounded-[14px] px-4 py-3"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)', textDecoration: 'none' }}>
          <span className="text-[13px] font-bold text-text">⚔️ Compare vs a friend</span>
          <span className="text-[13px] font-bold" style={{ color: 'var(--color-accent)' }}>→</span>
        </Link>

        {/* Points breakdown */}
        <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5 text-muted">
          Where your points came from
        </div>
        <div className="rounded-[14px] p-4 space-y-3"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          {rows.map(row => (
            <div key={row.label}>
              <div className="flex justify-between mb-1.5">
                <span className="text-[12px] text-sub">{row.label}</span>
                <span className="font-bold text-[12px]"
                  style={{ fontFamily: 'var(--font-mono)', color: row.color }}>
                  {row.value.toFixed(2)}
                </span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'var(--color-elev)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${(row.value / maxVal) * 100}%`, background: row.color, opacity: 0.8 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Pre-tournament picks */}
        {pick && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5 text-muted">
              Pre-tournament picks
            </div>
            <div className="rounded-[14px] p-4 space-y-3"
              style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
              <div className="flex items-center justify-between py-1">
                <span className="text-[12px] text-sub">🏆 Winner</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-text">{pick.winner_team}</span>
                  {pick.winner_points !== null && (
                    <span className="font-bold text-[12px]"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gold)' }}>
                      +{pick.winner_points.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between py-1"
                style={{ borderTop: '1px solid var(--border-base)' }}>
                <span className="text-[12px] text-sub">⚽ Top Scorer</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-text">{pick.top_scorer}</span>
                  {pick.top_scorer_points !== null && (
                    <span className="font-bold text-[12px]"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                      +{pick.top_scorer_points.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <Link href="/predict"
                className="block text-center text-[11px] font-bold py-2 rounded-lg transition-colors"
                style={{ color: 'var(--color-muted)', border: '1px solid var(--border-base)', background: 'var(--color-elev)' }}>
                Edit picks →
              </Link>
            </div>
          </>
        )}

        {/* Appearance */}
        <div className="flex items-center justify-between rounded-[14px] px-4 py-3"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          <span className="text-[13px] font-bold text-text">Appearance</span>
          <ThemeToggle />
        </div>

        {/* Admin link */}
        {profile?.is_admin && (
          <Link href="/admin"
            className="block w-full text-center py-2.5 rounded-xl font-bold text-[13px] transition-colors"
            style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)', color: 'var(--color-amber)' }}>
            ⚙️ Go to Admin Panel
          </Link>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
