type MissingPicksBannerProps = {
  missing: number
}

export function MissingPicksBanner({ missing }: MissingPicksBannerProps) {
  if (missing <= 0) return null

  const label = missing === 1 ? 'open pick' : 'open picks'

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}
    >
      <span className="text-xl">⚠️</span>
      <div>
        <div className="font-bold text-[13px]" style={{ color: 'var(--color-amber)' }}>
          You have {missing} {label} left
        </div>
        <div className="text-muted text-[11px] mt-0.5">
          Submit before they lock to keep scoring points
        </div>
      </div>
    </div>
  )
}
