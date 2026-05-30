'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { LeaderboardEntry } from '@/lib/types'

interface Props {
  entries: LeaderboardEntry[]
  currentUserId: string
}

const AVATARS = ['🦁','🐯','🦊','🐺','🦅','🐻','🐼','🦝','🦄','🐉','🦋','🌟','🔥','⚡','🎯']
function getAvatar(entry: LeaderboardEntry): string {
  if (entry.automation_strategy === 'max') return '▲'
  if (entry.automation_strategy === 'mid') return '◆'
  if (entry.automation_strategy === 'min') return '▼'
  if (entry.is_monkey) return '🐒'
  return AVATARS[entry.display_name.charCodeAt(0) % AVATARS.length]
}

function getAutomationLabel(entry: LeaderboardEntry): string | null {
  if (entry.automation_strategy === 'max') return 'max marker'
  if (entry.automation_strategy === 'mid') return 'mid marker'
  if (entry.automation_strategy === 'min') return 'min marker'
  if (entry.automation_strategy === 'monkey' || entry.is_monkey) return 'shadow'
  return null
}

function isAutomated(entry: LeaderboardEntry): boolean {
  return Boolean(entry.automation_strategy || entry.is_monkey)
}

function getAvatarFromName(name: string): string {
  return AVATARS[name.charCodeAt(0) % AVATARS.length]
}

const podiumColors = { gold: '#f5c441', silver: '#aab4cd', bronze: '#d18a4d' }
const podiumOrder = [
  { idx: 1, color: podiumColors.silver, height: 92 },
  { idx: 0, color: podiumColors.gold, height: 118 },
  { idx: 2, color: podiumColors.bronze, height: 72 },
]

export function Leaderboard({ entries, currentUserId }: Props) {
  const [mode, setMode] = useState<'total' | 'today'>('total')

  const sorted = mode === 'today'
    ? [...entries].sort((a, b) => b.today_points - a.today_points)
    : entries

  const score = (e: LeaderboardEntry) =>
    mode === 'today' ? e.today_points : e.total_points

  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const dangerZone = sorted.slice(-2)

  const hasToday = entries.some(e => e.today_points > 0)

  return (
    <div className="pb-28 px-4">
      {/* Mode toggle */}
      <div className="flex justify-center mb-5 mt-1">
        <div
          className="relative flex rounded-full p-[3px]"
          style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}
        >
          {/* sliding pill */}
          <div
            className="absolute top-[3px] bottom-[3px] rounded-full transition-all duration-200"
            style={{
              width: 'calc(50% - 3px)',
              left: mode === 'total' ? '3px' : 'calc(50%)',
              background: 'var(--color-accent)',
            }}
          />
          {(['total', 'today'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="relative z-10 px-5 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors duration-150"
              style={{ color: mode === m ? '#000' : 'var(--color-muted)', minWidth: 72 }}
            >
              {m === 'total' ? 'Total' : 'Today'}
            </button>
          ))}
        </div>
      </div>

      {/* No today data notice */}
      {mode === 'today' && !hasToday && (
        <div className="text-center text-[12px] font-semibold mb-4" style={{ color: 'var(--color-muted)' }}>
          No results scored yet for the latest day
        </div>
      )}

      {/* Podium */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-2 mb-5 mt-2">
          {podiumOrder.map(({ idx, color, height }) => {
            const entry = top3[idx]
            if (!entry) return null
            const rank = idx + 1
            const av = getAvatar(entry)
            return (
              <div key={entry.id} style={{ width: idx === 0 ? '36%' : '32%', textAlign: 'center' }}>
                <div
                  className="mx-auto mb-1.5 flex items-center justify-center rounded-full text-xl"
                  style={{ width: 42, height: 42, background: 'var(--color-elev)', border: `2px solid ${color}` }}
                >{av}</div>
                <div className="font-extrabold text-[13px] text-text truncate">{entry.display_name}</div>
                <div className="font-mono text-[11px] text-sub mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                  {score(entry).toFixed(1)}
                </div>
                <div
                  className="flex items-start justify-center pt-2 rounded-t-lg font-black text-[18px]"
                  style={{ height, background: `linear-gradient(180deg, ${color}, ${color}40)`, color: '#000' }}
                >{rank}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full list */}
      <div className="mb-3">
        {rest.map((entry, i) => {
          const rank = i + 4
          const isMe = entry.id === currentUserId
          const av = getAvatar(entry)
          const automationLabel = getAutomationLabel(entry)
          return (
            <div
              key={entry.id}
              className="flex items-center gap-3"
              style={{
                padding: '10px 12px',
                background: isMe ? 'var(--color-accent-soft)' : 'transparent',
                borderBottom: '1px solid var(--border-base)',
                borderLeft: isMe ? '2px solid var(--color-accent)' : '2px solid transparent',
                opacity: isAutomated(entry) ? 0.6 : 1,
                fontStyle: isAutomated(entry) ? 'italic' : 'normal',
              }}
            >
              <div
                className="font-bold text-[12px] w-[22px]"
                style={{ fontFamily: 'var(--font-mono)', color: isMe ? 'var(--color-accent)' : 'var(--color-muted)' }}
              >{rank}.</div>
              <div
                className="flex items-center justify-center rounded-full text-base shrink-0"
                style={{ width: 28, height: 28, background: 'var(--color-elev)', fontSize: 14 }}
              >{av}</div>
              <div
                className="flex-1 font-bold text-[13px]"
                style={{ color: isMe ? 'var(--color-accent)' : 'var(--color-text)' }}
              >
                {entry.display_name}
                {automationLabel && (
                  <span className="ml-1 text-[9px] not-italic" style={{ color: 'var(--color-muted)' }}>
                    · {automationLabel}
                  </span>
                )}
              </div>
              {!isMe && (
                <Link
                  href={`/h2h/${entry.id}`}
                  className="px-2 py-0.5 rounded-full not-italic shrink-0"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: 'var(--color-sub)',
                    background: 'var(--color-elev)',
                    border: '1px solid var(--border-base)',
                    textDecoration: 'none',
                  }}
                >
                  VS
                </Link>
              )}
              <div
                className="font-bold text-[13px]"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}
              >
                {score(entry).toFixed(1)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Danger zone */}
      {entries.length >= 2 && (
        <div
          className="rounded-xl p-3"
          style={{ background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs">⚠️</span>
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--color-danger)' }}
            >Danger zone · pays extra</span>
          </div>
          {dangerZone.map((e, i) => {
            const rank = sorted.length - 1 + i
            const fine = i === 0 ? '+₪200' : '+₪100'
            const av = e.is_monkey ? getAvatar(e) : getAvatarFromName(e.display_name)
            return (
              <div
                key={e.id}
                className="flex items-center gap-2.5"
                style={{ padding: '6px 0', borderBottom: i === 0 ? '1px dashed var(--border-danger)' : 'none' }}
              >
                <div
                  className="font-bold text-[11px] w-[22px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-danger)' }}
                >{rank}.</div>
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{ width: 22, height: 22, background: 'var(--color-elev)', fontSize: 12 }}
                >{av}</div>
                <div className="flex-1 text-[12px] font-semibold text-text">{e.display_name}</div>
                <div
                  className="text-[12px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-sub)' }}
                >{score(e).toFixed(1)}</div>
                <div
                  className="font-bold text-[11px] w-12 text-right"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-danger)' }}
                >{fine}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
