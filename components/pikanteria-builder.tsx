'use client'
import { useState } from 'react'

// Pikanteria now shares the match 1/X/2 shape. A question always has outcome 1
// and outcome 2 (e.g. Yes / No), and may optionally include the X (draw / middle)
// outcome. When X is off the question is two-way and X is hidden everywhere.
interface Props {
  defaults?: {
    label1?: string
    odds1?: string
    label2?: string
    odds2?: string
    labelX?: string | null
    oddsX?: string | null
  }
}

const inputBase = {
  background: 'var(--color-bg)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
}
const labelCls = 'rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 flex-1'
const oddsCls = 'rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 w-24'
const oddsStyle = { ...inputBase, color: 'var(--color-amber)', fontFamily: 'var(--font-mono)' }

export function PicanteriaBuilder({ defaults }: Props) {
  const [hasX, setHasX] = useState<boolean>(
    defaults?.labelX != null && defaults?.labelX !== '',
  )

  return (
    <div className="space-y-2">
      <div className="text-muted text-xs mb-1">Outcomes</div>

      {/* Outcome 1 */}
      <div className="flex gap-2 items-center">
        <span className="text-xs font-bold w-4 text-center" style={{ color: 'var(--color-amber)' }}>1</span>
        <input name="pik_label_1" aria-label="Outcome 1 label" type="text" placeholder="Yes"
          defaultValue={defaults?.label1 ?? ''} style={inputBase} className={labelCls} />
        <input name="pik_odds_1" aria-label="Outcome 1 odds" type="number" step="0.01" placeholder="1.80"
          defaultValue={defaults?.odds1 ?? ''} style={oddsStyle} className={oddsCls} />
      </div>

      {/* Outcome 2 */}
      <div className="flex gap-2 items-center">
        <span className="text-xs font-bold w-4 text-center" style={{ color: 'var(--color-amber)' }}>2</span>
        <input name="pik_label_2" aria-label="Outcome 2 label" type="text" placeholder="No"
          defaultValue={defaults?.label2 ?? ''} style={inputBase} className={labelCls} />
        <input name="pik_odds_2" aria-label="Outcome 2 odds" type="number" step="0.01" placeholder="2.10"
          defaultValue={defaults?.odds2 ?? ''} style={oddsStyle} className={oddsCls} />
      </div>

      {/* Optional X (draw / middle) outcome */}
      <label className="flex items-center gap-2 text-xs text-muted mt-1 cursor-pointer">
        <input type="checkbox" name="pik_has_x" checked={hasX} onChange={e => setHasX(e.target.checked)} />
        Add a third outcome (X)
      </label>
      {hasX && (
        <div className="flex gap-2 items-center">
          <span className="text-xs font-bold w-4 text-center" style={{ color: 'var(--color-amber)' }}>X</span>
          <input name="pik_label_x" aria-label="Outcome X label" type="text" placeholder="Draw"
            defaultValue={defaults?.labelX ?? ''} style={inputBase} className={labelCls} />
          <input name="pik_odds_x" aria-label="Outcome X odds" type="number" step="0.01" placeholder="3.20"
            defaultValue={defaults?.oddsX ?? ''} style={oddsStyle} className={oddsCls} />
        </div>
      )}
    </div>
  )
}
