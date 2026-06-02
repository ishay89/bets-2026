export type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | '3rd' | 'final'
export type Pick = '1' | 'X' | '2'
export type AutomationStrategy = 'monkey' | 'max' | 'mid' | 'min'

export interface User {
  id: string
  email: string
  display_name: string
  is_admin: boolean
  is_monkey: boolean
  automation_strategy: AutomationStrategy | null
  created_at: string
}

export interface MatchDay {
  id: string
  date: string
  stage: Stage
  lock_time: string
  locked: boolean
  published_at: string | null
  created_at: string
}

export interface Match {
  id: string
  match_day_id: string
  home_team: string
  away_team: string
  kickoff_time: string
  odds_home: number
  odds_draw: number
  odds_away: number
  result: Pick | null
  locked: boolean
  published_at: string | null
}

export interface PicanteriaOption {
  id: string
  pikanteria_id: string
  label: string
  odds: number
  is_correct: boolean
  sort_order: number
}

export interface Pikanteria {
  id: string
  match_day_id: string
  question: string
  locked: boolean
  created_at: string
  published_at: string | null
  options?: PicanteriaOption[]
}

export interface Prediction {
  id: string
  user_id: string
  match_id: string
  pick: Pick
  points: number | null
}

export interface PicanteriaAnswer {
  id: string
  user_id: string
  pikanteria_id: string
  option_id: string
  points: number | null
}

export interface PreTournamentPick {
  id: string
  user_id: string
  winner_team: string
  winner_odds: number
  top_scorer: string
  top_scorer_odds: number
  winner_points: number | null
  top_scorer_points: number | null
}

export interface LeaderboardEntry {
  id: string
  display_name: string
  is_monkey: boolean
  automation_strategy: AutomationStrategy | null
  total_points: number
  today_points: number
}

export interface ScoreSnapshot {
  id: string
  user_id: string
  match_day_id: string | null
  stage: string | null
  match_points: number
  pikanteria_points: number
  pre_tournament_winner_pts: number
  pre_tournament_scorer_pts: number
  day_points: number
  cumulative_points: number
  is_valid: boolean
  discrepancy: number | null
  calculated_at: string
  created_at: string
}
