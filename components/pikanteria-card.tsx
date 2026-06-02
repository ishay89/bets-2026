'use client'
import { useRef, useState, useTransition } from 'react'
import type { Pikanteria, PicanteriaOption } from '@/lib/types'
import { largestRemainder } from '@/lib/crowd'
import type { SaveResult } from '@/lib/prediction-saves'

interface Props {
  item: Pikanteria & { options: PicanteriaOption[] }
  currentAnswer: string | null
  isLocked: boolean
  onSave: (picanteriaId: string, optionId: string) => Promise<SaveResult>
  /** Per-option crowd counts, revealed only once the day is locked. */
  crowd?: Record<string, number> | null
  crowdTotal?: number
}

// Distinct segment colours cycled across N options (amber-led to stay on-theme).
const SEG_COLORS = ['var(--color-amber)', 'var(--color-accent)', 'var(--color-dim)', 'var(--color-silver)', 'var(--color-sub)']

export function PicanteriaCard({ item, currentAnswer, isLocked, onSave, crowd, crowdTotal = 0 }: Props) {
  // Optimistic overlay instead of copying the prop into state. `optimisticAnswer`
  // is null when no in-flight pick exists; the effective selection is the
  // in-flight value or the authoritative prop.
  const [optimisticAnswer, setOptimisticAnswer] = useState<string | null>(null)
  const selected = optimisticAnswer ?? currentAnswer
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pending, startTransition] = useTransition()
  const inFlightRef = useRef(false)

  function handleSelect(optionId: string) {
    if (isLocked || inFlightRef.current || selected === optionId) return
    const previous = optimisticAnswer
    inFlightRef.current = true
    setSaving(true)
    setError(null)
    setOptimisticAnswer(optionId)
    startTransition(async () => {
      try {
        const result = await onSave(item.id, optionId)
        if (!result.ok) {
          setOptimisticAnswer(previous)
          setError(result.message)
        } else {
          setOptimisticAnswer(null)
        }
      } catch {
        setOptimisticAnswer(previous)
        setError('Could not save pikanteria answer. Please try again.')
      } finally {
        inFlightRef.current = false
        setSaving(false)
      }
    })
  }

  const showCrowd = isLocked && crowd && crowdTotal > 0
  const crowdPct = showCrowd ? largestRemainder(item.options.map(o => crowd[o.id] ?? 0)) : []

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
            fontSize: 12,
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
                type="button"
                onClick={() => handleSelect(opt.id)}
                disabled={isLocked || pending || saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 transition-all duration-150 min-w-[72px]"
                style={{
                  background: sel ? 'var(--color-amber)' : 'var(--color-elev)',
                  color: sel ? '#000' : 'var(--color-text)',
                  border: sel ? '1px solid transparent' : '1px solid var(--border-base)',
                  opacity: isLocked ? 0.55 : 1,
                  cursor: isLocked || saving ? 'not-allowed' : 'pointer',
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
                    fontSize: 12,
                    opacity: 0.65,
                  }}
                >
                  {opt.odds.toFixed(2)}
                </span>
              </button>
            )
          })}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 text-[12px] font-semibold"
            style={{ color: 'var(--color-danger)' }}
          >
            {error}
          </div>
        )}

        {/* Crowd picks — revealed only after lock */}
        {showCrowd && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 12, paddingTop: 12 }}>
            <div
              className="mb-2"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
              }}
            >
              Crowd · {crowdTotal} {crowdTotal === 1 ? 'pick' : 'picks'}
            </div>

            <div
              className="flex w-full rounded-full overflow-hidden"
              style={{ height: 8, background: 'var(--color-elev)' }}
            >
              {item.options.map((opt, i) =>
                crowdPct[i] > 0 ? (
                  <div
                    key={opt.id}
                    style={{
                      width: `${crowdPct[i]}%`,
                      background: SEG_COLORS[i % SEG_COLORS.length],
                      opacity: selected === opt.id ? 1 : 0.8,
                    }}
                  />
                ) : null
              )}
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              {item.options.map((opt, i) => (
                <span
                  key={opt.id}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: selected === opt.id ? 'var(--color-amber)' : 'var(--color-muted)',
                    fontWeight: selected === opt.id ? 700 : 400,
                  }}
                >
                  {crowdPct[i]}% {opt.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
