'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Leaderboard } from './leaderboard'
import type { LeaderboardEntry } from '@/lib/types'

interface Props {
  initialEntries: LeaderboardEntry[]
  currentUserId: string
}

export function LeaderboardRealtime({ initialEntries, currentUserId }: Props) {
  const [entries, setEntries] = useState(initialEntries)

  useEffect(() => {
    const supabase = createClient()

    async function refresh() {
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .returns<LeaderboardEntry[]>()
      if (data) setEntries(data)
    }

    const channel = supabase
      .channel('leaderboard-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'predictions' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pikanteria_answers' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pre_tournament_picks' }, refresh)
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [])

  return <Leaderboard entries={entries} currentUserId={currentUserId} />
}
