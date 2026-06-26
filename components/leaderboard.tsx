'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import type { LeaderboardEntry } from '@/lib/types'
import { formatRankDelta, formatTodayMovementPoints } from '@/lib/leaderboard-movement'
import {
  hasLeaderboardResults,
  sortLeaderboardEntries,
  type LeaderboardScoreMode,
  type LeaderboardSortMode,
} from '@/lib/leaderboard-sort'

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
  if (entry.avatar_emoji) return entry.avatar_emoji
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

const podiumColors = { gold: '#f5b301', silver: '#9aa5b1', bronze: '#cd7f32' }
const podiumOrder = [
  { idx: 1, color: podiumColors.silver, height: 92 },
  { idx: 0, color: podiumColors.gold, height: 118 },
  { idx: 2, color: podiumColors.bronze, height: 72 },
]
const scoreModeOptions: LeaderboardScoreMode[] = ['total', 'today']
const sortModeOptions: LeaderboardSortMode[] = ['score', 'successRate']

function deltaColor(delta: number | null | undefined): string {
  return delta && delta < 0 ? 'var(--color-danger)' : 'var(--color-accent)'
}

function successLabel(entry: LeaderboardEntry, mode: 'total' | 'today'): string {
  const rate = mode === 'today' ? entry.today_success_rate : entry.total_success_rate
  const successful = mode === 'today' ? entry.today_successful_picks : entry.total_successful_picks
  const scored = mode === 'today' ? entry.today_scored_picks : entry.total_scored_picks
  if (typeof rate !== 'number' || scored === 0) return '-- (0/0)'
  const pct = Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(1)
  return `${pct}% (${successful}/${scored})`
}

export function Leaderboard({
  entries,
  currentUserId,
  todayModeLabel = 'Today',
  movementPointsLabel = 'today',
  todayEmptyMessage = 'No results scored yet for the latest day',
}: Props) {
  const [scoreMode, setScoreMode] = useState<LeaderboardScoreMode>('total')
  const [sortMode, setSortMode] = useState<LeaderboardSortMode>('score')

  const sorted = sortLeaderboardEntries(entries, scoreMode, sortMode)

  const score = (e: LeaderboardEntry) =>
    scoreMode === 'today' ? e.today_points : e.total_points

  const primaryMetric = (entry: LeaderboardEntry) =>
    sortMode === 'successRate' ? successLabel(entry, scoreMode) : score(entry).toFixed(2)

  const secondaryMetric = (entry: LeaderboardEntry) =>
    sortMode === 'successRate' ? `${score(entry).toFixed(2)} pts` : successLabel(entry, scoreMode)

  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)

  // Fines per the rules: the player finishing LAST pays ₪200, second-to-last
  // pays ₪100. Automated baselines are not eligible for prizes or fines, so
  // the fines target the bottom two human players.
  const humans = sortMode === 'score' ? sorted.filter(e => !isAutomated(e)) : []
  const fineByEntryId = new Map<string, string>()
  if (humans.length >= 2) {
    fineByEntryId.set(humans[humans.length - 1].id, '+₪200')
    fineByEntryId.set(humans[humans.length - 2].id, '+₪100')
  }
  const firstDangerIndex = rest.findIndex(e => fineByEntryId.has(e.id))

  const hasToday = hasLeaderboardResults(entries, 'today')
  const showScoreRankDetails = scoreMode === 'total' && sortMode === 'score'

  return (
    <div className="pb-28 px-4">
      {/* Mode toggles */}
      <div className="mb-5 mt-1 flex flex-col items-center gap-2">
        <div
          className="relative flex rounded-full p-[3px]"
          style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}
        >
          {/* sliding pill */}
          <div
            className="absolute top-[3px] bottom-[3px] rounded-full transition-all duration-200"
            style={{
              width: 'calc(50% - 3px)',
              left: scoreMode === 'total' ? '3px' : 'calc(50%)',
              background: 'var(--color-accent)',
            }}
          />
          {scoreModeOptions.map(m => (
            <button
              key={m}
              type="button"
              aria-pressed={scoreMode === m}
              onClick={() => setScoreMode(m)}
              className="relative z-10 px-5 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors duration-150"
              style={{ color: scoreMode === m ? '#fff' : 'var(--color-muted)', minWidth: 72 }}
            >
              {m === 'total' ? 'Total' : todayModeLabel}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold uppercase"
            style={{ color: 'var(--color-muted)', letterSpacing: '0.08em' }}
          >
            Rank by
          </span>
          <div
            className="relative flex rounded-full p-[3px]"
            style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}
          >
            <div
              className="absolute top-[3px] bottom-[3px] rounded-full transition-all duration-200"
              style={{
                width: 'calc(50% - 3px)',
                left: sortMode === 'score' ? '3px' : 'calc(50%)',
                background: 'var(--color-accent)',
              }}
            />
            {sortModeOptions.map(m => (
              <button
                key={m}
                type="button"
                aria-pressed={sortMode === m}
                onClick={() => setSortMode(m)}
                className="relative z-10 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors duration-150"
                style={{ color: sortMode === m ? '#fff' : 'var(--color-muted)', minWidth: 82 }}
              >
                {m === 'score' ? 'Score' : 'Success'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* No today data notice */}
      {scoreMode === 'today' && !hasToday && (
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
            const displayRank = showScoreRankDetails && entry.current_rank ? entry.current_rank : rank
            const rankDelta = showScoreRankDetails ? formatRankDelta(entry.rank_delta) : null
            const todayMovement = showScoreRankDetails
              ? formatTodayMovementPoints(entry.today_points, movementPointsLabel)
              : null
            const av = getAvatar(entry)
            const isMe = entry.id === currentUserId
            const profileHref = isMe ? '/history' : `/u/${entry.id}`
            return (
              <div key={entry.id} style={{ width: idx === 0 ? '36%' : '32%', textAlign: 'center' }}>
                <Link href={profileHref} prefetch={false} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div
                    className="mx-auto mb-1.5 flex items-center justify-center rounded-full text-xl"
                    style={{ width: 42, height: 42, background: 'var(--color-elev)', border: `2px solid ${color}` }}
                  >{av}</div>
                  <div className="font-extrabold text-[13px] text-text truncate">{entry.display_name}</div>
                </Link>
                <div className="font-mono text-[11px] text-sub mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                  {primaryMetric(entry)}
                </div>
                <div className="text-[10px] font-bold text-sub mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                  {secondaryMetric(entry)}
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
                  style={{ height, background: `linear-gradient(180deg, ${color}, ${color}40)`, color: '#fff' }}
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
          const displayRank = showScoreRankDetails && entry.current_rank ? entry.current_rank : rank
          const rankDelta = showScoreRankDetails ? formatRankDelta(entry.rank_delta) : null
          const todayMovement = showScoreRankDetails
            ? formatTodayMovementPoints(entry.today_points, movementPointsLabel)
            : null
          const isMe = entry.id === currentUserId
          const av = getAvatar(entry)
          const automationLabel = getAutomationLabel(entry)
          const isDanger = fineByEntryId.has(entry.id)
          const fine = fineByEntryId.get(entry.id) ?? null
          // Show the "danger zone" banner once, right above the first fined row.
          const isFirstAtDangerStart = i === firstDangerIndex
          return (
            <div key={entry.id}>
              {isDanger && isFirstAtDangerStart && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5"
                  style={{ background: 'var(--color-danger-soft)', borderTop: '1px solid var(--border-danger)' }}
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
                    ? 'var(--color-danger-soft)'
                    : isMe ? 'var(--color-accent-soft)' : 'transparent',
                  borderBottom: '1px solid var(--border-base)',
                  borderLeft: isMe ? '2px solid var(--color-accent)' : isDanger ? '2px solid var(--color-danger)' : '2px solid transparent',
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
                <Link
                  href={isMe ? '/history' : `/u/${entry.id}`}
                  prefetch={false}
                  className="flex flex-1 items-center gap-3 min-w-0 not-italic"
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    className="flex items-center justify-center rounded-full text-base shrink-0"
                    style={{ width: 28, height: 28, background: 'var(--color-elev)', fontSize: 14 }}
                  >{av}</div>
                  <div
                    className="flex-1 font-bold text-[13px] truncate"
                    style={{ color: isMe ? 'var(--color-accent)' : 'var(--color-text)' }}
                  >
                    {entry.display_name}
                    {automationLabel && (
                      <span className="ml-1 text-[12px] not-italic" style={{ color: 'var(--color-muted)' }}>
                        · {automationLabel}
                      </span>
                    )}
                  </div>
                </Link>
                {!isMe && (
                  <Link
                    href={`/h2h/${entry.id}`}
                    prefetch={false}
                    className="px-2 py-0.5 rounded-full not-italic shrink-0"
                    style={vsLinkStyle}
                  >
                    VS
                  </Link>
                )}
                <div
                  className="text-right font-bold text-[13px]"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text)',
                    minWidth: sortMode === 'successRate' ? 96 : 72,
                  }}
                >
                  <div>{primaryMetric(entry)}</div>
                  <div className="text-[10px] font-semibold text-sub">
                    {secondaryMetric(entry)}
                  </div>
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
