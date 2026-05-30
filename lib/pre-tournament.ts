export const PRE_TOURNAMENT_PATH = '/pre-tournament'

export const TEAMS = [
  { name: 'Argentina', odds: 4.0 },
  { name: 'France', odds: 4.5 },
  { name: 'Brazil', odds: 5.0 },
  { name: 'England', odds: 6.0 },
  { name: 'Germany', odds: 6.5 },
  { name: 'Spain', odds: 7.5 },
  { name: 'Portugal', odds: 8.0 },
  { name: 'Netherlands', odds: 9.0 },
  { name: 'USA', odds: 12.0 },
  { name: 'Mexico', odds: 15.0 },
] as const

export const SCORERS = [
  { name: 'K. Mbappé', odds: 5.0 },
  { name: 'Vinícius Jr', odds: 6.0 },
  { name: 'H. Kane', odds: 6.5 },
  { name: 'L. Messi', odds: 8.0 },
  { name: 'C. Ronaldo', odds: 9.0 },
  { name: 'E. Haaland', odds: 7.0 },
  { name: 'J. Bellingham', odds: 8.5 },
] as const

export const TEAM_NAMES = TEAMS.map(t => t.name)
export const SCORER_NAMES = SCORERS.map(s => s.name)

type PreTournamentPickStatus = {
  winner_team?: string | null
  top_scorer?: string | null
} | null

export function hasCompletedPreTournamentPick(pick: PreTournamentPickStatus): boolean {
  return Boolean(pick?.winner_team && pick?.top_scorer)
}

