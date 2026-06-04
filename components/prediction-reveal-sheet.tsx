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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease-out',
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: '70vh',
          overflowY: 'auto',
          borderRadius: '20px 20px 0 0',
          background: 'var(--color-panel)',
          border: '1px solid var(--border-base)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease-out',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div
            style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-dim)', opacity: 0.5 }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px 12px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--color-text)',
              letterSpacing: '0.03em',
              flex: 1,
              marginRight: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 20,
              color: 'var(--color-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '2px 4px',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Player list */}
        {rows.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--color-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗳️</div>
            No picks recorded yet
          </div>
        ) : (
          <div style={{ paddingBottom: 8 }}>
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 16px',
                    borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    background: isMe ? 'var(--color-accent-soft)' : 'transparent',
                    borderLeft: isMe ? '3px solid var(--color-accent)' : '3px solid transparent',
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'var(--color-elev)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {getAvatar({
                      display_name: row.displayName,
                      is_monkey: row.isMonkey,
                      automation_strategy: row.automationStrategy,
                    })}
                  </div>

                  {/* Name + rank */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {row.displayName}
                      {automationLabel && (
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--color-muted)',
                            fontWeight: 400,
                            marginLeft: 4,
                          }}
                        >
                          · {automationLabel}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--color-muted)',
                        marginTop: 1,
                      }}
                    >
                      {row.rank != null ? `#${row.rank}` : '—'}
                    </div>
                  </div>

                  {/* Pick label */}
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 13,
                      fontWeight: 700,
                      color: pickColor,
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}
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
