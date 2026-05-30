'use client'
import { useState } from 'react'

interface Option {
  label: string
  odds: string
}

interface Props {
  /** Which pikanteria slot this builder is for (1, 2, or 3) */
  questionIndex: number
}

const inputBase = {
  background: 'var(--color-bg)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
}

export function PicanteriaBuilder({ questionIndex: qi }: Props) {
  const [options, setOptions] = useState<Option[]>([
    { label: '', odds: '' },
    { label: '', odds: '' },
  ])

  function addOption() {
    setOptions(o => [...o, { label: '', odds: '' }])
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return
    setOptions(o => o.filter((_, i) => i !== idx))
  }

  function updateOption(idx: number, field: keyof Option, value: string) {
    setOptions(o => o.map((opt, i) => i === idx ? { ...opt, [field]: value } : opt))
  }

  return (
    <div className="space-y-2">
      {/* Hidden count so server action knows how many options to read */}
      <input type="hidden" name={`pik_opt_count_${qi}`} value={options.length} />

      <div className="text-muted text-xs mb-1">Options</div>
      {options.map((opt, idx) => {
        const j = idx + 1
        const placeholder = idx === 0 ? 'Yes' : idx === 1 ? 'No' : `Option ${j}`
        return (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              name={`pik_opt_label_${qi}_${j}`}
              placeholder={placeholder}
              value={opt.label}
              onChange={e => updateOption(idx, 'label', e.target.value)}
              style={inputBase}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 flex-1"
            />
            <input
              type="number"
              step="0.01"
              name={`pik_opt_odds_${qi}_${j}`}
              placeholder="1.80"
              value={opt.odds}
              onChange={e => updateOption(idx, 'odds', e.target.value)}
              style={{ ...inputBase, color: 'var(--color-amber)', fontFamily: 'var(--font-mono)' }}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 w-20"
            />
            <button
              type="button"
              onClick={() => removeOption(idx)}
              disabled={options.length <= 2}
              className="text-sm px-2 rounded hover:text-text transition-colors disabled:opacity-30"
              style={{ color: 'var(--color-muted)' }}
              title="Remove option"
            >
              ×
            </button>
          </div>
        )
      })}

      <button
        type="button"
        onClick={addOption}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg mt-1"
        style={{ color: 'var(--color-amber)', background: 'var(--color-amber-soft)' }}
      >
        + Add option
      </button>
    </div>
  )
}
