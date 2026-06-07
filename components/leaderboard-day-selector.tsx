'use client'

import { useRouter } from 'next/navigation'
import type { ScoredLeaderboardDay } from '@/lib/types'

interface Props {
  days: ScoredLeaderboardDay[]
  selectedDayId: string | null
}

function labelForDay(day: ScoredLeaderboardDay): string {
  return `${day.date} - ${day.stage}`
}

export function LeaderboardDaySelector({ days, selectedDayId }: Props) {
  const router = useRouter()

  return (
    <label className="flex items-center gap-2 text-[11px] font-semibold text-sub">
      <span className="sr-only">Leaderboard day</span>
      <select
        value={selectedDayId ?? ''}
        onChange={event => {
          const nextDay = event.target.value
          router.push(nextDay ? `/leaderboard?day=${nextDay}` : '/leaderboard')
        }}
        className="rounded-lg px-2 py-1 text-[11px] font-bold"
        style={{
          background: 'var(--color-elev)',
          border: '1px solid var(--border-base)',
          color: 'var(--color-text)',
        }}
      >
        <option value="">Live</option>
        {days.map(day => (
          <option key={day.id} value={day.id}>
            {labelForDay(day)}
          </option>
        ))}
      </select>
    </label>
  )
}
