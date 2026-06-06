import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase/types'
import type { AutomationStrategy } from './types'
import { parseUUID } from './validation'

export type PlayerRevealRow = {
  userId: string
  displayName: string
  isMonkey: boolean
  automationStrategy: AutomationStrategy | null
  pick: string
  rank: number
  totalPoints: number
}

export function sortAndRankRevealRows(
  rows: Omit<PlayerRevealRow, 'rank'>[],
): PlayerRevealRow[] {
  return [...rows]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}

type Db = SupabaseClient<Database>

type UserRaw = {
  display_name: string
  is_monkey: boolean
  automation_strategy: AutomationStrategy | null
  status: string
}

type PredRaw = {
  pick: string
  user_id: string
  users: UserRaw
}

type AnswerRaw = {
  pick: string
  user_id: string
  users: UserRaw
}

async function buildPointsMap(supabase: Db): Promise<Record<string, number>> {
  const { data } = await supabase.from('leaderboard').select('id, total_points')
  return Object.fromEntries((data ?? []).map(r => [r.id as string, Number(r.total_points) || 0]))
}

export async function getMatchPredictionsReveal(
  supabase: Db,
  matchId: string,
): Promise<PlayerRevealRow[]> {
  try {
    parseUUID(matchId, 'match_id')
  } catch {
    return []
  }
  const [{ data: predData }, pointsMap] = await Promise.all([
    supabase
      .from('predictions')
      .select('pick, user_id, users(display_name, is_monkey, automation_strategy, status)')
      .eq('match_id', matchId),
    buildPointsMap(supabase),
  ])
  if (!predData) return []
  const unranked = (predData as unknown as PredRaw[])
    .filter(p => p.users.status === 'approved')
    .map(p => ({
    userId: p.user_id,
    displayName: p.users.display_name,
    isMonkey: p.users.is_monkey,
    automationStrategy: p.users.automation_strategy,
    pick: p.pick,
    totalPoints: pointsMap[p.user_id] ?? 0,
  }))
  return sortAndRankRevealRows(unranked)
}

type FuturesRaw = {
  user_id: string
  winner_team: string
  top_scorer: string
  users: UserRaw
}

/** Both futures picks revealed together: one ranked list for the champion, one for the top scorer. */
export type FuturesReveal = {
  winner: PlayerRevealRow[]
  scorer: PlayerRevealRow[]
}

export async function getFuturesReveal(supabase: Db): Promise<FuturesReveal> {
  const [{ data }, pointsMap] = await Promise.all([
    supabase
      .from('pre_tournament_picks')
      .select('user_id, winner_team, top_scorer, users(display_name, is_monkey, automation_strategy, status)'),
    buildPointsMap(supabase),
  ])
  if (!data) return { winner: [], scorer: [] }
  const approved = (data as unknown as FuturesRaw[]).filter(p => p.users.status === 'approved')
  const base = (p: FuturesRaw) => ({
    userId: p.user_id,
    displayName: p.users.display_name,
    isMonkey: p.users.is_monkey,
    automationStrategy: p.users.automation_strategy,
    totalPoints: pointsMap[p.user_id] ?? 0,
  })
  return {
    winner: sortAndRankRevealRows(approved.map(p => ({ ...base(p), pick: p.winner_team }))),
    scorer: sortAndRankRevealRows(approved.map(p => ({ ...base(p), pick: p.top_scorer }))),
  }
}

export async function getPikanteriaAnswersReveal(
  supabase: Db,
  pikanteriaId: string,
): Promise<PlayerRevealRow[]> {
  try {
    parseUUID(pikanteriaId, 'pikanteria_id')
  } catch {
    return []
  }
  const [{ data: answerData }, pointsMap] = await Promise.all([
    supabase
      .from('pikanteria_answers')
      .select('pick, user_id, users(display_name, is_monkey, automation_strategy, status)')
      .eq('pikanteria_id', pikanteriaId),
    buildPointsMap(supabase),
  ])
  if (!answerData) return []
  const unranked = (answerData as unknown as AnswerRaw[])
    .filter(a => a.users.status === 'approved')
    .map(a => ({
    userId: a.user_id,
    displayName: a.users.display_name,
    isMonkey: a.users.is_monkey,
    automationStrategy: a.users.automation_strategy,
    pick: a.pick,
    totalPoints: pointsMap[a.user_id] ?? 0,
  }))
  return sortAndRankRevealRows(unranked)
}
