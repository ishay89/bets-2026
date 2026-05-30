import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatchDay, Match, Pikanteria, PicanteriaOption, LeaderboardEntry, Pick } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>

// ── Shared nested types ──────────────────────────────────────────────────────

export type FullMatchDay = MatchDay & {
  matches: Match[]
  pikanteria: (Pikanteria & { pikanteria_options: PicanteriaOption[] })[]
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
type PikaOptionRow = { id: string; label: string; is_correct: boolean }
type PikaAnswerRow = { option_id: string; points: number | null; user_id: string }
type HistoryPika = {
  id: string
  question: string
  pikanteria_options: PikaOptionRow[]
  pikanteria_answers: PikaAnswerRow[]
}

export type HistoryMatchDay = {
  id: string
  date: string
  stage: string
  lock_time: string
  locked: boolean
  matches: HistoryMatch[]
  pikanteria: HistoryPika[]
}

// ── Query functions ──────────────────────────────────────────────────────────

export async function getPublishedMatchDaysWithAll(supabase: Db): Promise<FullMatchDay[]> {
  const { data, error } = await supabase
    .from('match_days')
    .select('*, matches(*), pikanteria(*, pikanteria_options(*))')
    .not('published_at', 'is', null)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []) as FullMatchDay[]
}

// Returns match days with nested predictions and pikanteria_answers — used by
// both history and h2h pages. Includes lock_time/locked/kickoff_time for h2h
// lock detection; history pages simply ignore those extra fields.
export async function getMatchDaysWithUserData(supabase: Db): Promise<HistoryMatchDay[]> {
  const { data, error } = await supabase
    .from('match_days')
    .select(`
      id, date, stage, lock_time, locked,
      matches(id, home_team, away_team, kickoff_time, result, locked,
        predictions(pick, points, user_id)
      ),
      pikanteria(id, question,
        pikanteria_options(id, label, is_correct),
        pikanteria_answers(option_id, points, user_id)
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
): Promise<{ pikanteria_id: string; option_id: string }[]> {
  const { data, error } = await supabase
    .from('pikanteria_answers')
    .select('pikanteria_id, option_id')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as { pikanteria_id: string; option_id: string }[]
}

export async function getFirstPublishedLockTime(
  supabase: Db,
): Promise<{ lock_time: string } | null> {
  const { data, error } = await supabase
    .from('match_days')
    .select('lock_time')
    .not('published_at', 'is', null)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as { lock_time: string } | null
}

export async function getLeaderboardEntries(supabase: Db): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .returns<LeaderboardEntry[]>()
  if (error) throw error
  return data ?? []
}
