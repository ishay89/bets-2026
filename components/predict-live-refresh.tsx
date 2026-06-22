'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LIVE_REFRESH_MS = 20 * 1000
const REFRESH_DEBOUNCE_MS = 750

export function PredictLiveRefresh({ matchIds }: { matchIds: string[] }) {
  const router = useRouter()
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idsKey = matchIds.join(',')
  const idSet = useMemo(() => new Set(idsKey.length > 0 ? idsKey.split(',') : []), [idsKey])

  useEffect(() => {
    if (matchIds.length === 0) return

    function refreshSoon() {
      if (refreshTimerRef.current) return
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        router.refresh()
      }, REFRESH_DEBOUNCE_MS)
    }

    async function syncAndRefresh() {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/live-sync', { cache: 'no-store' })
        const { changed } = await res.json() as { changed?: boolean }
        // Only re-render the page when the sync actually wrote new live data —
        // the Supabase Realtime subscription below already covers updates
        // triggered by other users' syncs, so this poll is just a fallback.
        if (changed) refreshSoon()
      } catch {
        // A failed live sync should not make the prediction page noisy.
      }
    }

    const supabase = createClient()
    const channel = supabase
      .channel('predict-live-score-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, payload => {
        const next = payload.new as { id?: unknown }
        const updatedId = typeof next.id === 'string' ? next.id : null
        if (updatedId && idSet.has(updatedId)) refreshSoon()
      })
      .subscribe()

    void syncAndRefresh()
    const intervalId = setInterval(syncAndRefresh, LIVE_REFRESH_MS)
    const onVisibilityChange = () => { void syncAndRefresh() }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void channel.unsubscribe()
    }
  }, [idSet, matchIds.length, router])

  return null
}
