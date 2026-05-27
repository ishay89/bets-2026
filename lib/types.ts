export type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | '3rd' | 'final'
export type Pick = '1' | 'X' | '2'

export interface User {
  id: string
  email: string
  display_name: string
  is_admin: boolean
  is_monkey: boolean
  created_at: string
}

export interface MatchDay {
  id: string
  date: string
  stage: Stage
  lock_time: string
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
}

export interface Pikanteria {
  id: string
  match_day_id: string
  question: string
  odds_yes: number
  odds_no: number
  result: boolean | null
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
  answer: boolean
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
  total_points: number
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
