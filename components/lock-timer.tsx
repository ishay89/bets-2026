'use client'
import { useEffect, useState } from 'react'

function fmt(ms: number): string {
  if (ms <= 0) return 'LOCKED'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function LockTimer({ lockTime }: { lockTime: string }) {
  // eslint-disable-next-line react-hooks/purity
  const [remaining, setRemaining] = useState(new Date(lockTime).getTime() - Date.now())

  useEffect(() => {
    const id = setInterval(() => setRemaining(new Date(lockTime).getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [lockTime])

  const locked = remaining <= 0
  return (
    <div
      className="rounded-lg px-4 py-3 flex items-center justify-between"
      style={{
        background: locked ? 'rgba(239,79,91,0.08)' : 'rgba(245,166,35,0.08)',
        border: `1px solid ${locked ? 'rgba(239,79,91,0.25)' : 'rgba(245,166,35,0.25)'}`,
      }}
    >
      <span
        className="text-xs font-bold"
        style={{ color: locked ? 'var(--color-danger)' : 'var(--color-amber)' }}
      >
        {locked ? '🔒 Picks locked' : `⏰ Locks in ${fmt(remaining)}`}
      </span>
      {!locked && (
        <span
          className="text-xs font-bold tracking-widest"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-amber)' }}
        >
          {String(Math.floor(remaining / 3600000)).padStart(2, '0')}:
          {String(Math.floor((remaining % 3600000) / 60000)).padStart(2, '0')}:
          {String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}
        </span>
      )}
    </div>
  )
}
