import { isMatchLocked } from './lock'

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
