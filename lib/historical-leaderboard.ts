import type {
  AutomationStrategy,
  HistoricalLeaderboardEntry,
  ScoredLeaderboardDay,
  UserStatus,
} from './types'

type HistoricalUser = {
  id: string
  display_name: string
  is_monkey: boolean
  automation_strategy: AutomationStrategy | null
  status: UserStatus
}

type HistoricalSnapshot = {
  user_id: string
  match_day_id: string | null
  day_points: number | null
}

function rankByTotal(rows: { id: string; total: number }[]): Map<string, number> {
  const sorted = rows.toSorted((a, b) => b.total - a.total || a.id.localeCompare(b.id))
  const ranks = new Map<string, number>()
  let previousTotal: number | null = null
  let previousRank = 0

  sorted.forEach((row, index) => {
    const rank = previousTotal === row.total ? previousRank : index + 1
    ranks.set(row.id, rank)
    previousTotal = row.total
    previousRank = rank
  })

  return ranks
}

export function buildHistoricalLeaderboardEntries(params: {
  selectedDayId: string
  days: readonly ScoredLeaderboardDay[]
  users: readonly HistoricalUser[]
  snapshots: readonly HistoricalSnapshot[]
}): HistoricalLeaderboardEntry[] {
  const orderedDays = params.days.toSorted((a, b) => a.date.localeCompare(b.date))
  const selectedIndex = orderedDays.findIndex(day => day.id === params.selectedDayId)
  if (selectedIndex === -1) return []

  const selectedDay = orderedDays[selectedIndex]
  const previousDay = selectedIndex > 0 ? orderedDays[selectedIndex - 1] : null
  const selectedDayIds = new Set(orderedDays.slice(0, selectedIndex + 1).map(day => day.id))
  const previousDayIds = new Set(orderedDays.slice(0, selectedIndex).map(day => day.id))

  const selectedDayPoints = new Map<string, number>()
  const selectedTotals = new Map<string, number>()
  const previousTotals = new Map<string, number>()

  for (const snapshot of params.snapshots) {
    if (!snapshot.match_day_id) continue
    const points = Number(snapshot.day_points ?? 0)
    if (snapshot.match_day_id === selectedDay.id) {
      selectedDayPoints.set(snapshot.user_id, (selectedDayPoints.get(snapshot.user_id) ?? 0) + points)
    }
    if (selectedDayIds.has(snapshot.match_day_id)) {
      selectedTotals.set(snapshot.user_id, (selectedTotals.get(snapshot.user_id) ?? 0) + points)
    }
    if (previousDayIds.has(snapshot.match_day_id)) {
      previousTotals.set(snapshot.user_id, (previousTotals.get(snapshot.user_id) ?? 0) + points)
    }
  }

  const approvedUsers = params.users.filter(user => user.status === 'approved')
  const selectedRankInput = approvedUsers.map(user => ({
    id: user.id,
    total: selectedTotals.get(user.id) ?? 0,
  }))
  const previousRankInput = previousDay
    ? approvedUsers.map(user => ({
      id: user.id,
      total: previousTotals.get(user.id) ?? 0,
    }))
    : []

  const currentRanks = rankByTotal(selectedRankInput)
  const previousRanks = previousDay ? rankByTotal(previousRankInput) : new Map<string, number>()

  return approvedUsers
    .map(user => {
      const total = selectedTotals.get(user.id) ?? 0
      const previousTotal = previousDay ? (previousTotals.get(user.id) ?? 0) : null
      const currentRank = currentRanks.get(user.id) ?? null
      const previousRank = previousDay ? (previousRanks.get(user.id) ?? null) : null

      return {
        id: user.id,
        display_name: user.display_name,
        is_monkey: user.is_monkey,
        automation_strategy: user.automation_strategy,
        total_points: total,
        today_points: selectedDayPoints.get(user.id) ?? 0,
        previous_total_points: previousTotal,
        current_rank: currentRank,
        previous_rank: previousRank,
        rank_delta: previousRank !== null && currentRank !== null ? previousRank - currentRank : null,
        selected_match_day_id: selectedDay.id,
        selected_date: selectedDay.date,
        selected_stage: selectedDay.stage,
      }
    })
    .toSorted((a, b) => b.total_points - a.total_points || a.display_name.localeCompare(b.display_name))
}
