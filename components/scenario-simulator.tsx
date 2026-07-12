'use client'

import { useState } from 'react'
import { SCORERS } from '@/lib/pre-tournament'
import type { TournamentScenario } from '@/lib/scenario-leaderboard'

interface Props {
  availableTeams: string[]
  onScenarioChange: (scenario: TournamentScenario | null) => void
}

const selectClass = 'w-full rounded-[10px] px-3 py-2.5 text-[13px] font-semibold outline-none'
const selectStyle = {
  color: 'var(--color-text)',
  background: 'var(--color-elev)',
  border: '1px solid var(--border-base)',
}

export function ScenarioSimulator({ availableTeams, onScenarioChange }: Props) {
  const [isOpen, setIsOpen] = useState(true)
  const [winner, setWinner] = useState('')
  const [runnerUp, setRunnerUp] = useState('')
  const [topScorer, setTopScorer] = useState('')

  const hasSelection = Boolean(winner || runnerUp || topScorer)

  function updateScenario(nextWinner: string, nextRunnerUp: string, nextTopScorer: string) {
    if (nextWinner || nextRunnerUp || nextTopScorer) {
      onScenarioChange({
        winner: nextWinner || null,
        runnerUp: nextRunnerUp || null,
        topScorer: nextTopScorer || null,
      })
    } else {
      onScenarioChange(null)
    }
  }

  function resetScenario() {
    setWinner('')
    setRunnerUp('')
    setTopScorer('')
    onScenarioChange(null)
  }

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
                  const nextRunnerUp = runnerUp === nextWinner ? '' : runnerUp
                  setWinner(nextWinner)
                  if (nextRunnerUp !== runnerUp) setRunnerUp(nextRunnerUp)
                  updateScenario(nextWinner, nextRunnerUp, topScorer)
                }}
              >
                <option value="">Choose team…</option>
                {availableTeams.map(team => <option key={team} value={team}>{team}</option>)}
              </select>
            </label>

            <label className="space-y-1 text-[11px] font-bold text-sub">
              <span>🥈 Runner-up</span>
              <select
                aria-label="Scenario runner-up"
                className={selectClass}
                style={selectStyle}
                value={runnerUp}
                onChange={event => {
                  const nextRunnerUp = event.target.value
                  setRunnerUp(nextRunnerUp)
                  updateScenario(winner, nextRunnerUp, topScorer)
                }}
              >
                <option value="">Choose team…</option>
                {availableTeams.map(team => (
                  <option key={team} value={team} disabled={team === winner}>{team}</option>
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
                onChange={event => {
                  const nextTopScorer = event.target.value
                  setTopScorer(nextTopScorer)
                  updateScenario(winner, runnerUp, nextTopScorer)
                }}
              >
                <option value="">Choose player…</option>
                {SCORERS.map(scorer => <option key={scorer.name} value={scorer.name}>{scorer.name}</option>)}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold text-muted">
              Choose any result to update the leaderboard below. Preview only — nothing is saved.
            </p>
            {hasSelection && (
              <button
                type="button"
                onClick={resetScenario}
                className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold"
                style={{ color: 'var(--color-sub)', background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
