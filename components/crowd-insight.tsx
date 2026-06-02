import type { Insight } from '@/lib/crowd'

const TONE: Record<Insight['tone'], { color: string; background: string; border: string }> = {
  accent: { color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: 'var(--border-accent)' },
  amber: { color: 'var(--color-amber)', background: 'var(--color-amber-soft)', border: 'var(--border-warn)' },
  neutral: { color: 'var(--color-sub)', background: 'var(--color-elev)', border: 'var(--border-base)' },
}

const staticBadgeStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
}

export function CrowdInsight({ insight }: { insight: Insight }) {
  const t = TONE[insight.tone]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5"
      style={{
        ...staticBadgeStyle,
        color: t.color,
        background: t.background,
        border: `1px solid ${t.border}`,
      }}
    >
      {insight.label}
    </span>
  )
}
