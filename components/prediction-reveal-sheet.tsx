'use client'
import { useEffect, useState } from 'react'
import { computePickDistribution, type PlayerRevealRow } from '@/lib/prediction-reveals'
import type { Pick } from '@/lib/types'
import { getAvatar, getAutomationLabel } from '@/lib/display'
import { PickDistributionChart, pickColor } from './pick-distribution-chart'

interface Props {
  title: string
  rows: PlayerRevealRow[]
  myUserId: string
  /** option_id → label map; when present, treats `row.pick` as an option_id. */
  optionLabels?: Record<string, string>
  /** Winning outcome, if known. When set, each row shows a ✓/✗ verdict against `row.pick`. */
  result?: Pick | null
  onClose: () => void
}

export function PredictionRevealSheet({ title, rows, myUserId, optionLabels, result, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 0); return () => clearTimeout(t) }, [])

  const optionKeys = optionLabels ? Object.keys(optionLabels) : undefined
  const segments = computePickDistribution(rows)
  const missingCount = rows.reduce((n, r) => (r.pick === null ? n + 1 : n), 0)
  const colorByPick: Record<string, string> = Object.fromEntries(
    segments.map((s, i) => [s.pick, pickColor(s.pick, i, optionLabels, optionKeys)]),
  )

  return (
    <div className="prediction-reveal-shell">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close picks panel"
        onClick={onClose}
        className="prediction-reveal-backdrop"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* Sheet */}
      <div
        className="prediction-reveal-panel"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Drag handle */}
        <div className="prediction-reveal-handle-wrap">
          <div className="prediction-reveal-handle" />
        </div>

        {/* Header */}
        <div className="prediction-reveal-header">
          <span className="prediction-reveal-title">
            {title}
          </span>
          <button
            type="button"
            aria-label="Close picks panel"
            onClick={onClose}
            className="prediction-reveal-close"
          >
            ×
          </button>
        </div>

        {/* Pick distribution */}
        <PickDistributionChart segments={segments} colorByPick={colorByPick} optionLabels={optionLabels} />

        {missingCount > 0 && (
          <div
            style={{
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--color-muted)',
              padding: '0 16px 8px',
            }}
          >
            {`🕳️ ${missingCount} ${missingCount === 1 ? 'player' : 'players'} didn't bet`}
          </div>
        )}

        {/* Player list */}
        {rows.length === 0 ? (
          <div className="prediction-reveal-empty">
            <div className="prediction-reveal-empty-icon">🗳️</div>
            No picks recorded yet
          </div>
        ) : (
          <div className="prediction-reveal-list">
            {rows.map((row, i) => {
              const isMe = row.userId === myUserId
              const didNotBet = row.pick === null
              const pickLabel = didNotBet
                ? "Didn't bet"
                : (optionLabels ? (optionLabels[row.pick!] ?? row.pick!) : row.pick!)
              const pickColorValue = didNotBet ? 'var(--color-muted)' : colorByPick[row.pick!]
              const automationLabel = getAutomationLabel({
                is_monkey: row.isMonkey,
                automation_strategy: row.automationStrategy,
              })

              return (
                <div
                  key={row.userId}
                  className="prediction-reveal-row"
                  style={{
                    borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    background: isMe ? 'var(--color-accent-soft)' : 'transparent',
                    borderLeft: isMe ? '3px solid var(--color-accent)' : '3px solid transparent',
                    opacity: didNotBet ? 0.6 : 1,
                  }}
                >
                  {/* Avatar */}
                  <div className="prediction-reveal-avatar">
                    {getAvatar({
                      display_name: row.displayName,
                      is_monkey: row.isMonkey,
                      automation_strategy: row.automationStrategy,
                      avatar_emoji: row.avatarEmoji,
                    })}
                  </div>

                  {/* Name + rank */}
                  <div className="prediction-reveal-main">
                    <div className="prediction-reveal-name">
                      {row.displayName}
                      {automationLabel && (
                        <span className="prediction-reveal-automation">
                          · {automationLabel}
                        </span>
                      )}
                    </div>
                    <div className="prediction-reveal-rank">
                      {row.rank != null ? `#${row.rank}` : '—'}
                    </div>
                  </div>

                  {/* Pick label, odds, and result verdict */}
                  <div className="prediction-reveal-pick-wrap">
                    <div className="flex items-center gap-1">
                      {result != null && !didNotBet && (
                        <span style={{ fontSize: 12, color: row.pick === result ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                          {row.pick === result ? '✓' : '✗'}
                        </span>
                      )}
                      <div
                        className="prediction-reveal-pick"
                        style={{ color: pickColorValue, fontStyle: didNotBet ? 'italic' : 'normal' }}
                      >
                        {pickLabel}
                      </div>
                    </div>
                    {row.odds != null && (
                      <div className="prediction-reveal-odds">{row.odds.toFixed(2)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
