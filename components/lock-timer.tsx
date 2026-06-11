'use client'
import { useEffect, useReducer, useRef } from 'react'
import { useRouter } from 'next/navigation'

function fmt(ms: number): string {
  if (ms <= 0) return 'LOCKED'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function msUntil(lockTime: string): number {
  return new Date(lockTime).getTime() - Date.now()
}

export function LockTimer({ lockTime }: { lockTime: string }) {
  const router = useRouter()
  const refreshedRef = useRef(false)
  const [remaining, dispatch] = useReducer(
    (_: number, lt: string) => msUntil(lt),
    lockTime,
    msUntil,
  )

  // When the countdown reaches zero, the match is now locked server-side too —
  // refresh once so the page re-fetches isLocked/crowd data and reveals it.
  useEffect(() => {
    refreshedRef.current = false
    dispatch(lockTime)
    const id = setInterval(() => {
      const ms = msUntil(lockTime)
      dispatch(lockTime)
      if (ms <= 0 && !refreshedRef.current) {
        refreshedRef.current = true
        router.refresh()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [lockTime, router])

  const locked = remaining <= 0
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center justify-between"
      style={{
        background: locked ? 'var(--color-danger-soft)' : 'var(--color-amber-soft)',
        border: `1px solid ${locked ? 'var(--border-danger)' : 'var(--border-warn)'}`,
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
