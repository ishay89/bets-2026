import { isMatchLocked } from './lock'
import { hasCompletedPreTournamentPick } from './pre-tournament'

export type OpenMatch = {
  id: string
  kickoff_time: string
  locked: boolean | null
  published_at: string | null
}

export type OpenPikanteria = {
  id: string
  locked: boolean
  published_at: string | null
}

export type MatchDayWithItems = {
  id: string
  date: string
  stage: string
  matches: OpenMatch[]
  pikanteria: OpenPikanteria[]
}

export type MissingCounts = {
  total: number
  submitted: number
  missing: number
}

/**
 * Open items are published and not yet locked — exactly what a player can
 * still act on. Per-item publishing means a match_day can be published while
 * an individual match or pikanteria item inside it is still a draft.
 */
function openItemsForDay(day: MatchDayWithItems): { matches: OpenMatch[]; pikanteria: OpenPikanteria[] } {
  return {
    matches: day.matches.filter(m => m.published_at != null && !isMatchLocked(m)),
    pikanteria: day.pikanteria.filter(p => p.published_at != null && !p.locked),
  }
}

/** Ids of all open (published, unlocked) matches/pikanteria across the given match days. */
export function collectOpenItemIds(matchDays: MatchDayWithItems[]): {
  matchIds: string[]
  pikanteriaIds: string[]
} {
  const matchIds: string[] = []
  const pikanteriaIds: string[] = []
  for (const day of matchDays) {
    const { matches, pikanteria } = openItemsForDay(day)
    matchIds.push(...matches.map(m => m.id))
    pikanteriaIds.push(...pikanteria.map(p => p.id))
  }
  return { matchIds, pikanteriaIds }
}

export function computeUserMissingCounts(params: {
  matchDays: MatchDayWithItems[]
  predictedMatchIds: Set<string>
  answeredPikanteriaIds: Set<string>
  futuresOpen: boolean
  futuresCompleted: boolean
}): MissingCounts {
  const { matchDays, predictedMatchIds, answeredPikanteriaIds, futuresOpen, futuresCompleted } = params

  let total = 0
  let submitted = 0

  for (const day of matchDays) {
    const { matches, pikanteria } = openItemsForDay(day)
    total += matches.length + pikanteria.length
    submitted += matches.filter(m => predictedMatchIds.has(m.id)).length
    submitted += pikanteria.filter(p => answeredPikanteriaIds.has(p.id)).length
  }

  if (futuresOpen) {
    total += 1
    if (futuresCompleted) submitted += 1
  }

  return { total, submitted, missing: total - submitted }
}

export type DayMissingSummary = {
  matchDayId: string
  date: string
  stage: string
  totalSlots: number
  submittedCount: number
  missingCount: number
}

export type FuturesMissingSummary = {
  totalPlayers: number
  completedCount: number
}

export type PlayerMissingRow = {
  player: { id: string; display_name: string }
  missingCount: number
  futuresMissing: boolean
}

export type MissingPicksSummary = {
  days: DayMissingSummary[]
  futures: FuturesMissingSummary | null
  players: PlayerMissingRow[]
}

export type MissingPicksViewState = {
  hasOpenItems: boolean
  hasMissingPicks: boolean
}

export function computeMissingPicksViewState(summary: MissingPicksSummary): MissingPicksViewState {
  const openDaySlots = summary.days.reduce((total, day) => total + day.totalSlots, 0)
  const openFuturesSlots = summary.futures?.totalPlayers ?? 0
  const hasOpenItems = openDaySlots + openFuturesSlots > 0
  const hasMissingPicks =
    summary.days.some(day => day.missingCount > 0) ||
    (summary.futures ? summary.futures.completedCount < summary.futures.totalPlayers : false)

  return { hasOpenItems, hasMissingPicks }
}

function groupByUser<T extends { user_id: string }, K extends string>(
  rows: T[],
  keyOf: (row: T) => K,
): Map<string, Set<K>> {
  const map = new Map<string, Set<K>>()
  for (const row of rows) {
    const set = map.get(row.user_id) ?? new Set<K>()
    set.add(keyOf(row))
    map.set(row.user_id, set)
  }
  return map
}

export function computeAllPlayersMissingPicks(params: {
  matchDays: MatchDayWithItems[]
  players: { id: string; display_name: string }[]
  predictions: { user_id: string; match_id: string }[]
  answers: { user_id: string; pikanteria_id: string }[]
  futuresPicks: { user_id: string; winner_team: string | null; top_scorer: string | null }[]
  futuresOpen: boolean
}): MissingPicksSummary {
  const { matchDays, players, predictions, answers, futuresPicks, futuresOpen } = params

  const predictionsByUser = groupByUser(predictions, p => p.match_id)
  const answersByUser = groupByUser(answers, a => a.pikanteria_id)
  const completedFuturesByUser = new Set<string>()
  for (const pick of futuresPicks) {
    if (hasCompletedPreTournamentPick(pick)) {
      completedFuturesByUser.add(pick.user_id)
    }
  }

  const openByDay = matchDays.map(day => ({ day, open: openItemsForDay(day) }))

  const days: DayMissingSummary[] = []
  for (const { day, open } of openByDay) {
    const itemCount = open.matches.length + open.pikanteria.length
    if (itemCount === 0) continue

    let submittedCount = 0
    for (const player of players) {
      const predicted = predictionsByUser.get(player.id) ?? new Set<string>()
      const answered = answersByUser.get(player.id) ?? new Set<string>()
      submittedCount += open.matches.filter(m => predicted.has(m.id)).length
      submittedCount += open.pikanteria.filter(p => answered.has(p.id)).length
    }

    const totalSlots = itemCount * players.length
    days.push({
      matchDayId: day.id,
      date: day.date,
      stage: day.stage,
      totalSlots,
      submittedCount,
      missingCount: totalSlots - submittedCount,
    })
  }

  const futures: FuturesMissingSummary | null = futuresOpen
    ? {
        totalPlayers: players.length,
        completedCount: players.filter(p => completedFuturesByUser.has(p.id)).length,
      }
    : null

  const playerRows: PlayerMissingRow[] = players.map(player => {
    const predicted = predictionsByUser.get(player.id) ?? new Set<string>()
    const answered = answersByUser.get(player.id) ?? new Set<string>()

    let missingCount = 0
    for (const { open } of openByDay) {
      missingCount += open.matches.filter(m => !predicted.has(m.id)).length
      missingCount += open.pikanteria.filter(p => !answered.has(p.id)).length
    }

    const futuresMissing = futuresOpen && !completedFuturesByUser.has(player.id)
    if (futuresMissing) missingCount += 1

    return { player, missingCount, futuresMissing }
  })

  playerRows.sort((a, b) => b.missingCount - a.missingCount)

  return { days, futures, players: playerRows }
}
