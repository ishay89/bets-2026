import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase/types'
import type { AutomationStrategy } from './types'
import { parseUUID } from './validation'

export type PlayerRevealRow = {
  userId: string
  displayName: string
  isMonkey: boolean
  automationStrategy: AutomationStrategy | null
  avatarEmoji: string | null
  pick: string
  /** Odds for this player's pick. Null for match/pikanteria rows — BetCard fills these in
   * client-side from its own `options`. Populated server-side for futures rows. */
  odds: number | null
  rank: number
  totalPoints: number
}

export function sortAndRankRevealRows(
  rows: Omit<PlayerRevealRow, 'rank'>[],
): PlayerRevealRow[] {
  return rows
    .toSorted((a, b) => b.totalPoints - a.totalPoints)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}

type Db = SupabaseClient<Database>

type UserRaw = {
  display_name: string
  is_monkey: boolean
  automation_strategy: AutomationStrategy | null
  avatar_emoji: string | null
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
      .select('pick, user_id, users(display_name, is_monkey, automation_strategy, avatar_emoji, status)')
      .eq('match_id', matchId),
    buildPointsMap(supabase),
  ])
  if (!predData) return []
  const unranked: Omit<PlayerRevealRow, 'rank'>[] = []
  for (const prediction of predData as unknown as PredRaw[]) {
    if (prediction.users.status !== 'approved') continue
    unranked.push({
      userId: prediction.user_id,
      displayName: prediction.users.display_name,
      isMonkey: prediction.users.is_monkey,
      automationStrategy: prediction.users.automation_strategy,
      avatarEmoji: prediction.users.avatar_emoji,
      pick: prediction.pick,
      odds: null,
      totalPoints: pointsMap[prediction.user_id] ?? 0,
    })
  }
  return sortAndRankRevealRows(unranked)
}

type FuturesRaw = {
  user_id: string
  winner_team: string
  winner_odds: number
  top_scorer: string
  top_scorer_odds: number
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
      .select('user_id, winner_team, winner_odds, top_scorer, top_scorer_odds, users(display_name, is_monkey, automation_strategy, avatar_emoji, status)'),
    buildPointsMap(supabase),
  ])
  if (!data) return { winner: [], scorer: [] }
  const approved = (data as unknown as FuturesRaw[]).filter(p => p.users.status === 'approved')
  const base = (p: FuturesRaw) => ({
    userId: p.user_id,
    displayName: p.users.display_name,
    isMonkey: p.users.is_monkey,
    automationStrategy: p.users.automation_strategy,
    avatarEmoji: p.users.avatar_emoji,
    totalPoints: pointsMap[p.user_id] ?? 0,
  })
  return {
    winner: sortAndRankRevealRows(approved.map(p => ({ ...base(p), pick: p.winner_team, odds: p.winner_odds }))),
    scorer: sortAndRankRevealRows(approved.map(p => ({ ...base(p), pick: p.top_scorer, odds: p.top_scorer_odds }))),
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
      .select('pick, user_id, users(display_name, is_monkey, automation_strategy, avatar_emoji, status)')
      .eq('pikanteria_id', pikanteriaId),
    buildPointsMap(supabase),
  ])
  if (!answerData) return []
  const unranked: Omit<PlayerRevealRow, 'rank'>[] = []
  for (const answer of answerData as unknown as AnswerRaw[]) {
    if (answer.users.status !== 'approved') continue
    unranked.push({
      userId: answer.user_id,
      displayName: answer.users.display_name,
      isMonkey: answer.users.is_monkey,
      automationStrategy: answer.users.automation_strategy,
      avatarEmoji: answer.users.avatar_emoji,
      pick: answer.pick,
      odds: null,
      totalPoints: pointsMap[answer.user_id] ?? 0,
    })
  }
  return sortAndRankRevealRows(unranked)
}
