import type { PickDistributionSegment } from '@/lib/prediction-reveals'

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

/** Picks a stable color for a reveal-row pick value, shared between the
 * per-row pick label and its pie-chart segment. */
export function pickColor(
  pick: string,
  index: number,
  optionLabels?: Record<string, string>,
  optionKeys?: string[],
): string {
  if (optionLabels && optionKeys) return SEG_COLORS[optionKeys.indexOf(pick) % SEG_COLORS.length]
  return MATCH_PICK_COLORS[pick] ?? SEG_COLORS[index % SEG_COLORS.length]
}

const SIZE = 72
const STROKE = 10
const RADIUS = (SIZE - STROKE) / 2

interface Props {
  segments: PickDistributionSegment[]
  colorByPick: Record<string, string>
  optionLabels?: Record<string, string>
}

export function PickDistributionChart({ segments, colorByPick, optionLabels }: Props) {
  if (segments.length === 0) return null

  const total = segments.reduce((sum, s) => sum + s.count, 0)
  const segmentsWithOffsets = segments.reduce<{
    items: (PickDistributionSegment & { dashOffset: number })[]
    nextOffset: number
  }>(
    (acc, seg) => ({
      items: [...acc.items, { ...seg, dashOffset: acc.nextOffset }],
      nextOffset: acc.nextOffset - seg.pct,
    }),
    { items: [], nextOffset: 100 },
  ).items

  return (
    <div className="prediction-reveal-distribution">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {segmentsWithOffsets.map(seg => (
            <circle
              key={seg.pick}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={colorByPick[seg.pick]}
              strokeWidth={STROKE}
              pathLength={100}
              strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
              strokeDashoffset={seg.dashOffset}
            />
          ))}
        </g>
        <text
          x={SIZE / 2}
          y={SIZE / 2}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, fill: 'var(--color-text)' }}
        >
          {total}
        </text>
      </svg>
      <div className="prediction-reveal-distribution-legend">
        {segments.map(seg => (
          <div key={seg.pick} className="prediction-reveal-distribution-item">
            <span className="prediction-reveal-distribution-swatch" style={{ background: colorByPick[seg.pick] }} />
            <span>{optionLabels?.[seg.pick] ?? seg.pick} · {seg.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
