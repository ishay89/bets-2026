import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MatchDay,
  Match,
  Pikanteria,
  LeaderboardEntry,
  Pick,
  ScoredLeaderboardDay,
  HistoricalLeaderboardEntry,
} from './types'
import type { Database } from './supabase/types'
import type { AutomatedUser } from './monkey'
import { buildHistoricalLeaderboardEntries, selectScoredLeaderboardDays } from './historical-leaderboard'

type Db = SupabaseClient<Database>

// ── Shared nested types ──────────────────────────────────────────────────────

export type FullMatchDay = MatchDay & {
  matches: Match[]
  pikanteria: Pikanteria[]
}

type PredRow = { pick: Pick; points: number | null; user_id: string }
type HistoryMatch = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  result: Pick | null
  locked: boolean | null
  predictions: PredRow[]
}
type PikaAnswerRow = { pick: Pick; points: number | null; user_id: string }
type HistoryPika = {
  id: string
  question: string
  locked: boolean
  label_1: string
  label_2: string
  label_x: string | null
  result: Pick | null
  pikanteria_answers: PikaAnswerRow[]
}

export type HistoryMatchDay = {
  id: string
  date: string
  stage: string
  matches: HistoryMatch[]
  pikanteria: HistoryPika[]
}

// ── Query functions ──────────────────────────────────────────────────────────

export async function getPublishedMatchDaysWithAll(supabase: Db): Promise<FullMatchDay[]> {
  const { data, error } = await supabase
    .from('match_days')
    .select('*, matches(*), pikanteria(*)')
    .not('published_at', 'is', null)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []) as FullMatchDay[]
}

// Returns match days with nested predictions and pikanteria_answers — used by
// both history and h2h pages. Includes kickoff_time and item-level lock state
// for H2H visibility; history pages simply ignore those extra fields.
export async function getMatchDaysWithUserData(supabase: Db): Promise<HistoryMatchDay[]> {
  const { data, error } = await supabase
    .from('match_days')
    .select(`
      id, date, stage,
      matches(id, home_team, away_team, kickoff_time, result, locked,
        predictions(pick, points, user_id)
      ),
      pikanteria(id, question, locked, label_1, label_2, label_x, result,
        pikanteria_answers(pick, points, user_id)
      )
    `)
    .not('published_at', 'is', null)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []) as HistoryMatchDay[]
}

export async function getUserPredictions(
  supabase: Db,
  userId: string,
): Promise<{ match_id: string; pick: Pick }[]> {
  const { data, error } = await supabase
    .from('predictions')
    .select('match_id, pick')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as { match_id: string; pick: Pick }[]
}

export async function getUserPikanteriaAnswers(
  supabase: Db,
  userId: string,
): Promise<{ pikanteria_id: string; pick: Pick }[]> {
  const { data, error } = await supabase
    .from('pikanteria_answers')
    .select('pikanteria_id, pick')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as { pikanteria_id: string; pick: Pick }[]
}

/** Automated benchmark players (those with an automation_strategy). */
export async function getAutomatedUsers(supabase: Db): Promise<AutomatedUser[]> {
  const { data } = await supabase
    .from('users')
    .select('id, automation_strategy')
    .not('automation_strategy', 'is', null)
    .returns<AutomatedUser[]>()
  return data ?? []
}

/**
 * Returns true if futures picks (winner / top scorer) are manually locked.
 */
export async function isFuturesLocked(supabase: Db): Promise<boolean> {
  const { data: settings } = await supabase
    .from('tournament_settings')
    .select('futures_locked')
    .eq('id', true)
    .single()
  return settings?.futures_locked ?? false
}

/**
 * Returns true if the futures picks (winner / top scorer) are published and
 * therefore visible/savable on /predict. Defaults to true when unset.
 */
export async function isFuturesPublished(supabase: Db): Promise<boolean> {
  const { data: settings } = await supabase
    .from('tournament_settings')
    .select('futures_published')
    .eq('id', true)
    .single()
  return settings?.futures_published ?? true
}

export async function getLeaderboardEntries(supabase: Db): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .returns<LeaderboardEntry[]>()
  if (error) throw error
  return data ?? []
}

export async function getScoredLeaderboardDays(supabase: Db): Promise<ScoredLeaderboardDay[]> {
  const { data, error } = await supabase
    .from('match_days')
    .select('id, date, stage, matches(result), pikanteria(result)')
    .order('date', { ascending: false })
  if (error) throw error

  return selectScoredLeaderboardDays((data ?? []) as Array<ScoredLeaderboardDay & {
    matches: { result: string | null }[]
    pikanteria: { result: string | null }[]
  }>)
}

export async function getHistoricalLeaderboardEntries(
  supabase: Db,
  selectedDayId: string,
  days: ScoredLeaderboardDay[],
): Promise<HistoricalLeaderboardEntry[]> {
  const [{ data: users, error: usersError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
    supabase
      .from('users')
      .select('id, display_name, is_monkey, automation_strategy, status'),
    supabase
      .from('score_snapshots')
      .select('user_id, match_day_id, day_points'),
  ])

  if (usersError) throw usersError
  if (snapshotsError) throw snapshotsError

  return buildHistoricalLeaderboardEntries({
    selectedDayId,
    days,
    users: users ?? [],
    snapshots: snapshots ?? [],
  })
}
