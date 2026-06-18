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
  avatar_emoji: string | null
  status: UserStatus
}

type HistoricalSnapshot = {
  user_id: string
  match_day_id: string | null
  day_points: number | null
}

export type HistoricalScoredPick = {
  user_id: string
  match_day_id: string
  is_success: boolean
}

type ScoredLeaderboardDayRow = ScoredLeaderboardDay & {
  matches?: readonly { result: string | null }[] | null
  pikanteria?: readonly { result: string | null }[] | null
}

export function selectScoredLeaderboardDays(days: readonly ScoredLeaderboardDayRow[]): ScoredLeaderboardDay[] {
  const scoredDays: ScoredLeaderboardDay[] = []
  for (const day of days) {
    const hasResult =
      (day.matches ?? []).some(item => item.result !== null)
      || (day.pikanteria ?? []).some(item => item.result !== null)
    if (!hasResult) continue

    scoredDays.push({
      id: day.id,
      date: day.date,
      stage: day.stage,
    })
  }
  return scoredDays
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

function successRate(successful: number, scored: number): number | null {
  if (scored === 0) return null
  return Math.round((successful * 1000) / scored) / 10
}

export function buildHistoricalLeaderboardEntries(params: {
  selectedDayId: string
  days: readonly ScoredLeaderboardDay[]
  users: readonly HistoricalUser[]
  snapshots: readonly HistoricalSnapshot[]
  scoredPicks?: readonly HistoricalScoredPick[]
}): HistoricalLeaderboardEntry[] {
  const orderedDays = params.days.toSorted((a, b) => a.date.localeCompare(b.date))
  const selectedIndex = orderedDays.findIndex(day => day.id === params.selectedDayId)
  if (selectedIndex === -1) return []

  const selectedDay = orderedDays[selectedIndex]
  const previousDay = selectedIndex > 0 ? orderedDays[selectedIndex - 1] : null
  const includePreTournament = selectedDay.stage === 'final'
  const selectedDayIds = new Set(orderedDays.slice(0, selectedIndex + 1).map(day => day.id))
  const previousDayIds = new Set(orderedDays.slice(0, selectedIndex).map(day => day.id))

  const selectedDayPoints = new Map<string, number>()
  const selectedTotals = new Map<string, number>()
  const previousTotals = new Map<string, number>()
  const preTournamentPoints = new Map<string, number>()
  const totalScoredPicks = new Map<string, number>()
  const totalSuccessfulPicks = new Map<string, number>()
  const todayScoredPicks = new Map<string, number>()
  const todaySuccessfulPicks = new Map<string, number>()

  for (const snapshot of params.snapshots) {
    const points = Number(snapshot.day_points ?? 0)
    if (!snapshot.match_day_id) {
      if (includePreTournament) {
        preTournamentPoints.set(snapshot.user_id, (preTournamentPoints.get(snapshot.user_id) ?? 0) + points)
      }
      continue
    }
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

  for (const pick of params.scoredPicks ?? []) {
    if (!selectedDayIds.has(pick.match_day_id)) continue

    totalScoredPicks.set(pick.user_id, (totalScoredPicks.get(pick.user_id) ?? 0) + 1)
    if (pick.is_success) {
      totalSuccessfulPicks.set(pick.user_id, (totalSuccessfulPicks.get(pick.user_id) ?? 0) + 1)
    }

    if (pick.match_day_id === selectedDay.id) {
      todayScoredPicks.set(pick.user_id, (todayScoredPicks.get(pick.user_id) ?? 0) + 1)
      if (pick.is_success) {
        todaySuccessfulPicks.set(pick.user_id, (todaySuccessfulPicks.get(pick.user_id) ?? 0) + 1)
      }
    }
  }

  const approvedUsers = params.users.filter(user => user.status === 'approved')
  const selectedRankInput = approvedUsers.map(user => ({
    id: user.id,
    total: (selectedTotals.get(user.id) ?? 0) + (preTournamentPoints.get(user.id) ?? 0),
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
      const preTournament = preTournamentPoints.get(user.id) ?? 0
      const total = (selectedTotals.get(user.id) ?? 0) + preTournament
      const previousTotal = previousDay ? (previousTotals.get(user.id) ?? 0) : null
      const currentRank = currentRanks.get(user.id) ?? null
      const previousRank = previousDay ? (previousRanks.get(user.id) ?? null) : null
      const totalScored = totalScoredPicks.get(user.id) ?? 0
      const totalSuccessful = totalSuccessfulPicks.get(user.id) ?? 0
      const todayScored = todayScoredPicks.get(user.id) ?? 0
      const todaySuccessful = todaySuccessfulPicks.get(user.id) ?? 0

      return {
        id: user.id,
        display_name: user.display_name,
        is_monkey: user.is_monkey,
        automation_strategy: user.automation_strategy,
        avatar_emoji: user.avatar_emoji,
        total_points: total,
        today_points: (selectedDayPoints.get(user.id) ?? 0) + preTournament,
        previous_total_points: previousTotal,
        current_rank: currentRank,
        previous_rank: previousRank,
        rank_delta: previousRank !== null && currentRank !== null ? previousRank - currentRank : null,
        total_success_rate: successRate(totalSuccessful, totalScored),
        total_successful_picks: totalSuccessful,
        total_scored_picks: totalScored,
        today_success_rate: successRate(todaySuccessful, todayScored),
        today_successful_picks: todaySuccessful,
        today_scored_picks: todayScored,
        selected_match_day_id: selectedDay.id,
        selected_date: selectedDay.date,
        selected_stage: selectedDay.stage,
      }
    })
    .toSorted((a, b) => b.total_points - a.total_points || a.display_name.localeCompare(b.display_name))
}
