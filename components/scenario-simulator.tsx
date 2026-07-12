'use client'

import { useState } from 'react'
import { SCORERS, TEAMS } from '@/lib/pre-tournament'
import {
  buildScenarioLeaderboard,
  type ScenarioFuturesPick,
} from '@/lib/scenario-leaderboard'
import type { LeaderboardEntry } from '@/lib/types'

interface Props {
  entries: LeaderboardEntry[]
  picks: ScenarioFuturesPick[]
  currentUserId: string
}

function rankChangeLabel(change: number): string {
  if (change > 0) return `↑${change}`
  if (change < 0) return `↓${Math.abs(change)}`
  return '—'
}

function rankChangeColor(change: number): string {
  if (change > 0) return 'var(--color-accent)'
  if (change < 0) return 'var(--color-danger)'
  return 'var(--color-muted)'
}

const selectClass = 'w-full rounded-[10px] px-3 py-2.5 text-[13px] font-semibold outline-none'
const selectStyle = {
  color: 'var(--color-text)',
  background: 'var(--color-elev)',
  border: '1px solid var(--border-base)',
}

export function ScenarioSimulator({ entries, picks, currentUserId }: Props) {
  const [isOpen, setIsOpen] = useState(true)
  const [winner, setWinner] = useState('')
  const [runnerUp, setRunnerUp] = useState('')
  const [topScorer, setTopScorer] = useState('')

  const isComplete = Boolean(winner && runnerUp && topScorer)
  const rows = isComplete
    ? buildScenarioLeaderboard(entries, picks, { winner, runnerUp, topScorer })
    : []

  return (
    <section
      className="overflow-hidden rounded-[14px]"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <span>
          <span className="block font-display text-[15px] font-extrabold text-text">🔮 Scenarios</span>
          <span className="block text-[11px] font-semibold text-sub">
            Pick the final outcome and preview the table
          </span>
        </span>
        <span className="text-[18px] font-bold text-sub" aria-hidden="true">{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div className="space-y-3 border-t p-3" style={{ borderColor: 'var(--border-base)' }}>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-[11px] font-bold text-sub">
              <span>🥇 Winner</span>
              <select
                aria-label="Scenario winner"
                className={selectClass}
                style={selectStyle}
                value={winner}
                onChange={event => {
                  const nextWinner = event.target.value
                  setWinner(nextWinner)
                  if (runnerUp === nextWinner) setRunnerUp('')
                }}
              >
                <option value="">Choose team…</option>
                {TEAMS.map(team => <option key={team.name} value={team.name}>{team.name}</option>)}
              </select>
            </label>

            <label className="space-y-1 text-[11px] font-bold text-sub">
              <span>🥈 Runner-up</span>
              <select
                aria-label="Scenario runner-up"
                className={selectClass}
                style={selectStyle}
                value={runnerUp}
                onChange={event => setRunnerUp(event.target.value)}
              >
                <option value="">Choose team…</option>
                {TEAMS.map(team => (
                  <option key={team.name} value={team.name} disabled={team.name === winner}>{team.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-[11px] font-bold text-sub">
              <span>⚽ Top scorer</span>
              <select
                aria-label="Scenario top scorer"
                className={selectClass}
                style={selectStyle}
                value={topScorer}
                onChange={event => setTopScorer(event.target.value)}
              >
                <option value="">Choose player…</option>
                {SCORERS.map(scorer => <option key={scorer.name} value={scorer.name}>{scorer.name}</option>)}
              </select>
            </label>
          </div>

          <p className="text-[10px] font-semibold text-muted">
            Preview only — no picks or results are changed.
          </p>

          {isComplete ? (
            <div className="max-h-[420px] overflow-y-auto rounded-[10px]" style={{ border: '1px solid var(--border-base)' }}>
              <div
                className="sticky top-0 grid grid-cols-[32px_minmax(0,1fr)_70px_52px] gap-2 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-muted"
                style={{ background: 'var(--color-elev)' }}
              >
                <span>#</span><span>Player</span><span className="text-right">Points</span><span className="text-right">Move</span>
              </div>
              {rows.map(row => {
                const isMe = row.id === currentUserId
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[32px_minmax(0,1fr)_70px_52px] items-center gap-2 px-3 py-2 text-[12px]"
                    style={{
                      background: isMe ? 'var(--color-accent-soft)' : 'transparent',
                      borderTop: '1px solid var(--border-base)',
                    }}
                  >
                    <span className="font-mono font-bold text-sub">{row.projectedRank}</span>
                    <span className="truncate font-bold text-text">
                      {row.displayName}{isMe ? ' (you)' : ''}
                    </span>
                    <span className="text-right font-mono font-bold text-text">{row.projectedPoints.toFixed(2)}</span>
                    <span
                      className="text-right font-mono font-extrabold"
                      style={{ color: rankChangeColor(row.rankChange) }}
                    >
                      {rankChangeLabel(row.rankChange)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[10px] px-3 py-4 text-center text-[12px] font-semibold text-sub" style={{ background: 'var(--color-elev)' }}>
              Choose all three results to calculate the projected table.
            </div>
          )}
        </div>
      )}
    </section>
  )
}
