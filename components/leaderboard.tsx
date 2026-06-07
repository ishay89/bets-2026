'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import type { LeaderboardEntry } from '@/lib/types'
import { formatRankDelta, formatTodayMovementPoints } from '@/lib/leaderboard-movement'

interface Props {
  entries: LeaderboardEntry[]
  currentUserId: string
  todayModeLabel?: string
  movementPointsLabel?: string
  todayEmptyMessage?: string
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

const vsLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--color-sub)',
  background: 'var(--color-elev)',
  border: '1px solid var(--border-base)',
  textDecoration: 'none',
}

const podiumColors = { gold: '#f5c441', silver: '#aab4cd', bronze: '#d18a4d' }
const podiumOrder = [
  { idx: 1, color: podiumColors.silver, height: 92 },
  { idx: 0, color: podiumColors.gold, height: 118 },
  { idx: 2, color: podiumColors.bronze, height: 72 },
]

function deltaColor(delta: number | null | undefined): string {
  return delta && delta < 0 ? 'var(--color-danger)' : 'var(--color-accent)'
}

export function Leaderboard({
  entries,
  currentUserId,
  todayModeLabel = 'Today',
  movementPointsLabel = 'today',
  todayEmptyMessage = 'No results scored yet for the latest day',
}: Props) {
  const [mode, setMode] = useState<'total' | 'today'>('total')

  const sorted = mode === 'today'
    ? entries.toSorted((a, b) => b.today_points - a.today_points)
    : entries

  const score = (e: LeaderboardEntry) =>
    mode === 'today' ? e.today_points : e.total_points

  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const dangerStartRank = sorted.length - 1

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
              type="button"
              onClick={() => setMode(m)}
              className="relative z-10 px-5 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors duration-150"
              style={{ color: mode === m ? '#000' : 'var(--color-muted)', minWidth: 72 }}
            >
              {m === 'total' ? 'Total' : todayModeLabel}
            </button>
          ))}
        </div>
      </div>

      {/* No today data notice */}
      {mode === 'today' && !hasToday && (
        <div className="text-center text-[12px] font-semibold mb-4" style={{ color: 'var(--color-muted)' }}>
          {todayEmptyMessage}
        </div>
      )}

      {/* Podium */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-2 mb-5 mt-2">
          {podiumOrder.map(({ idx, color, height }) => {
            const entry = top3[idx]
            if (!entry) return null
            const rank = idx + 1
            const displayRank = mode === 'total' && entry.current_rank ? entry.current_rank : rank
            const rankDelta = mode === 'total' ? formatRankDelta(entry.rank_delta) : null
            const todayMovement = mode === 'total'
              ? formatTodayMovementPoints(entry.today_points, movementPointsLabel)
              : null
            const av = getAvatar(entry)
            return (
              <div key={entry.id} style={{ width: idx === 0 ? '36%' : '32%', textAlign: 'center' }}>
                <div
                  className="mx-auto mb-1.5 flex items-center justify-center rounded-full text-xl"
                  style={{ width: 42, height: 42, background: 'var(--color-elev)', border: `2px solid ${color}` }}
                >{av}</div>
                <div className="font-extrabold text-[13px] text-text truncate">{entry.display_name}</div>
                <div className="font-mono text-[11px] text-sub mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                  {score(entry).toFixed(2)}
                </div>
                {(rankDelta || todayMovement) && (
                  <div className="mb-1 flex min-h-[16px] items-center justify-center gap-1.5 text-[10px] font-bold">
                    {rankDelta && (
                      <span
                        className="rounded-full px-1.5 py-0.5"
                        style={{
                          color: deltaColor(entry.rank_delta),
                          background: 'var(--color-elev)',
                          border: '1px solid var(--border-base)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {rankDelta}
                      </span>
                    )}
                    {todayMovement && (
                      <span className="text-sub" style={{ fontFamily: 'var(--font-mono)' }}>
                        {todayMovement}
                      </span>
                    )}
                  </div>
                )}
                <div
                  className="flex items-start justify-center pt-2 rounded-t-lg font-black text-[18px]"
                  style={{ height, background: `linear-gradient(180deg, ${color}, ${color}40)`, color: '#000' }}
                >{displayRank}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full list */}
      <div className="rounded-b-xl overflow-hidden">
        {rest.map((entry, i) => {
          const rank = i + 4
          const displayRank = mode === 'total' && entry.current_rank ? entry.current_rank : rank
          const rankDelta = mode === 'total' ? formatRankDelta(entry.rank_delta) : null
          const todayMovement = mode === 'total'
            ? formatTodayMovementPoints(entry.today_points, movementPointsLabel)
            : null
          const isMe = entry.id === currentUserId
          const av = getAvatar(entry)
          const automationLabel = getAutomationLabel(entry)
          const isDanger = entries.length >= 2 && rank >= dangerStartRank
          const fine = rank === sorted.length - 1 ? '+₪200' : rank === sorted.length ? '+₪100' : null
          return (
            <div key={entry.id}>
              {isDanger && rank === dangerStartRank && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5"
                  style={{ background: 'rgba(239,79,91,0.12)', borderTop: '1px solid rgba(239,79,91,0.3)' }}
                >
                  <span className="text-[11px]">⚠️</span>
                  <span
                    className="text-[12px] font-bold uppercase"
                    style={{ color: 'var(--color-danger)', letterSpacing: '0.04em' }}
                  >Danger zone · pays extra</span>
                </div>
              )}
              <div
                className="flex items-center gap-3"
                style={{
                  padding: '10px 12px',
                  background: isDanger
                    ? 'rgba(239,79,91,0.06)'
                    : isMe ? 'var(--color-accent-soft)' : 'transparent',
                  borderBottom: '1px solid var(--border-base)',
                  borderLeft: isMe ? '2px solid var(--color-accent)' : isDanger ? '2px solid rgba(239,79,91,0.4)' : '2px solid transparent',
                  opacity: isAutomated(entry) ? 0.6 : 1,
                  fontStyle: isAutomated(entry) ? 'italic' : 'normal',
                }}
              >
                <div
                  className="font-bold text-[12px] w-[22px]"
                  style={{ fontFamily: 'var(--font-mono)', color: isDanger ? 'var(--color-danger)' : isMe ? 'var(--color-accent)' : 'var(--color-muted)' }}
                >{displayRank}.</div>
                {rankDelta && (
                  <div
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold shrink-0"
                    style={{
                      color: deltaColor(entry.rank_delta),
                      background: 'var(--color-elev)',
                      border: '1px solid var(--border-base)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {rankDelta}
                  </div>
                )}
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
                    <span className="ml-1 text-[12px] not-italic" style={{ color: 'var(--color-muted)' }}>
                      · {automationLabel}
                    </span>
                  )}
                </div>
                {!isMe && (
                  <Link
                    href={`/h2h/${entry.id}`}
                    className="px-2 py-0.5 rounded-full not-italic shrink-0"
                    style={vsLinkStyle}
                  >
                    VS
                  </Link>
                )}
                <div
                  className="min-w-[72px] text-right font-bold text-[13px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}
                >
                  <div>{score(entry).toFixed(2)}</div>
                  {todayMovement && (
                    <div className="text-[10px] font-semibold text-sub">{todayMovement}</div>
                  )}
                </div>
                {fine && (
                  <div
                    className="font-bold text-[11px] w-12 text-right"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-danger)' }}
                  >{fine}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
