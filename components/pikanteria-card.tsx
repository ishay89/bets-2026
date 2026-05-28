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
    <div className="bet-card p-4">
      <p className="text-[13px] font-semibold text-text mb-3">{item.question}</p>
      <div className="flex gap-1.5 flex-wrap">
        {item.options.map(opt => {
          const sel = selected === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              disabled={isLocked || pending}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 font-bold text-[12px] transition-all min-w-[72px]"
              style={{
                background: sel ? 'var(--color-amber)' : 'var(--color-elev)',
                color: sel ? '#000' : 'var(--color-text)',
                border: sel ? 'none' : '1px solid rgba(246,248,232,0.09)',
                opacity: isLocked ? 0.5 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
              }}
            >
              <span>{opt.label}</span>
              <span className="opacity-70 font-semibold text-[11px]"
                style={{ fontFamily: 'var(--font-mono)' }}>
                {opt.odds.toFixed(2)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
