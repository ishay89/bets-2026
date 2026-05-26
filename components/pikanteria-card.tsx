'use client'
import { useState, useTransition } from 'react'
import type { Pikanteria } from '@/lib/types'

interface Props {
  item: Pikanteria
  currentAnswer: boolean | null
  isLocked: boolean
  onSave: (picanteriaId: string, answer: boolean) => Promise<void>
}

export function PicanteriaCard({ item, currentAnswer, isLocked, onSave }: Props) {
  const [selected, setSelected] = useState<boolean | null>(currentAnswer)
  const [pending, startTransition] = useTransition()

  function handleSelect(answer: boolean) {
    if (isLocked) return
    setSelected(answer)
    startTransition(() => onSave(item.id, answer))
  }

  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[13px] font-semibold text-text mb-3">{item.question}</p>
      <div className="flex gap-1.5">
        {([
          [true, 'Yes', item.odds_yes] as const,
          [false, 'No', item.odds_no] as const,
        ]).map(([val, label, odds]) => {
          const sel = selected === val
          return (
            <button
              key={label}
              onClick={() => handleSelect(val)}
              disabled={isLocked || pending}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 font-bold text-[12px] transition-all"
              style={{
                background: sel ? 'var(--color-amber)' : 'var(--color-elev)',
                color: sel ? '#000' : 'var(--color-text)',
                border: sel ? 'none' : '1px solid rgba(255,255,255,0.06)',
                opacity: isLocked ? 0.5 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
              }}
            >
              <span>{label}</span>
              <span className="opacity-70 font-semibold text-[11px]"
                style={{ fontFamily: 'var(--font-mono)' }}>
                {odds.toFixed(2)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
