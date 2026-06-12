'use client'
import { useEffect, useState } from 'react'
import type { PlayerRevealRow } from '@/lib/prediction-reveals'
import { getAvatar, getAutomationLabel } from '@/lib/display'

const SEG_COLORS = [
  'var(--color-amber)',
  'var(--color-accent)',
  'var(--color-dim)',
  'var(--color-silver)',
  'var(--color-sub)',
]

const MATCH_PICK_COLORS: Record<string, string> = {
  '1': 'var(--color-accent)',
  X: 'var(--color-dim)',
  '2': 'var(--color-amber)',
}

interface Props {
  title: string
  rows: PlayerRevealRow[]
  myUserId: string
  /** option_id → label map; when present, treats `row.pick` as an option_id. */
  optionLabels?: Record<string, string>
  onClose: () => void
}

export function PredictionRevealSheet({ title, rows, myUserId, optionLabels, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 0); return () => clearTimeout(t) }, [])

  const optionKeys = optionLabels ? Object.keys(optionLabels) : []

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
              const pickLabel = optionLabels ? (optionLabels[row.pick] ?? row.pick) : row.pick
              const pickColor = optionLabels
                ? SEG_COLORS[optionKeys.indexOf(row.pick) % SEG_COLORS.length]
                : (MATCH_PICK_COLORS[row.pick] ?? 'var(--color-muted)')
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

                  {/* Pick label */}
                  <div
                    className="prediction-reveal-pick"
                    style={{ color: pickColor }}
                  >
                    {pickLabel}
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
