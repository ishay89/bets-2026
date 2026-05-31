import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/bottom-nav'
import { getAvatar, getAutomationLabel, isAutomated } from '@/lib/display'
import type { LeaderboardEntry } from '@/lib/types'
import { getLeaderboardEntries } from '@/lib/data'

export default async function H2HPickerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const entries = await getLeaderboardEntries(supabase)

  const others = entries.filter(e => e.id !== user?.id)
  const humans = others.filter(e => !isAutomated(e))
  const baselines = others.filter(e => isAutomated(e))

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-3">
        <div
          className="text-[10px]"
          style={{
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
          }}
        >
          Head to head
        </div>
        <div className="text-[22px] font-extrabold text-text tracking-tight">Pick a rival</div>
      </div>

      <main className="px-4 pb-28 space-y-5">
        {others.length === 0 && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
          >
            <div className="text-3xl mb-2">🤝</div>
            <div className="text-sub text-[13px] font-semibold">
              No one to compare with yet — invite some friends.
            </div>
          </div>
        )}

        {humans.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Players</SectionLabel>
            <PlayerList players={humans} />
          </div>
        )}

        {baselines.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Baselines</SectionLabel>
            <PlayerList players={baselines} muted />
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-0.5"
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: 10,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--color-muted)',
      }}
    >
      {children}
    </div>
  )
}

function PlayerList({ players, muted = false }: { players: LeaderboardEntry[]; muted?: boolean }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
    >
      {players.map((p, i, arr) => {
        const automated = isAutomated(p)
        const label = getAutomationLabel(p)
        return (
          <Link
            key={p.id}
            href={`/h2h/${p.id}`}
            className="flex items-center gap-3"
            style={{
              padding: '12px 14px',
              borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              textDecoration: 'none',
              opacity: muted || automated ? 0.6 : 1,
              fontStyle: automated ? 'italic' : 'normal',
            }}
          >
            <div
              className="flex items-center justify-center rounded-full shrink-0"
              style={{ width: 30, height: 30, background: 'var(--color-elev)', fontSize: 15 }}
            >
              {getAvatar(p)}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="truncate"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}
              >
                {p.display_name}
                {label && (
                  <span
                    className="ml-1 not-italic"
                    style={{ fontSize: 9, color: 'var(--color-muted)' }}
                  >
                    · {label}
                  </span>
                )}
              </div>
              <div
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}
              >
                {p.total_points.toFixed(2)} pts
              </div>
            </div>
            <div
              className="px-3 py-1 rounded-full shrink-0"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--color-accent)',
                background: 'var(--color-accent-soft)',
                border: '1px solid var(--border-accent)',
                fontStyle: 'normal',
              }}
            >
              VS →
            </div>
          </Link>
        )
      })}
    </div>
  )
}
