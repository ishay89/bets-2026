'use client'
import { useState, useTransition } from 'react'
import type { Pikanteria, PicanteriaOption } from '@/lib/types'

interface Props {
  item: Pikanteria & { options: PicanteriaOption[] }
  currentAnswer: string | null
  isLocked: boolean
  onSave: (picanteriaId: string, optionId: string) => Promise<void>
}

export function PicanteriaCard({ item, currentAnswer, isLocked, onSave }: Props) {
  const [selected, setSelected] = useState<string | null>(currentAnswer)
  const [pending, startTransition] = useTransition()

  function handleSelect(optionId: string) {
    if (isLocked) return
    setSelected(optionId)
    startTransition(() => onSave(item.id, optionId))
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--color-panel)',
        border: '1px solid var(--border-warn)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Spicy header */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{
          background: 'var(--color-amber-soft)',
          borderBottom: '1px solid var(--border-warn)',
        }}
      >
        <span style={{ fontSize: 14 }}>🌶️</span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color-amber)',
            fontWeight: 600,
          }}
        >
          Pikanteria
        </span>
      </div>

      <div className="px-4 py-3">
        <p
          className="mb-3"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text)',
            lineHeight: 1.45,
          }}
        >
          {item.question}
        </p>

        <div className="flex gap-2 flex-wrap">
          {item.options.map(opt => {
            const sel = selected === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                disabled={isLocked || pending}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 transition-all duration-150"
                style={{
                  background: sel ? 'var(--color-amber)' : 'var(--color-elev)',
                  color: sel ? '#000' : 'var(--color-text)',
                  border: sel ? '1px solid transparent' : '1px solid var(--border-base)',
                  opacity: isLocked ? 0.55 : 1,
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  minWidth: 72,
                  transform: sel ? 'scale(1.03)' : 'scale(1)',
                  boxShadow: sel ? '0 4px 14px rgba(245,166,35,0.35)' : 'none',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  {opt.label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    opacity: 0.65,
                  }}
                >
                  {opt.odds.toFixed(2)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
