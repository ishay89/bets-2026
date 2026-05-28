export const PRE_TOURNAMENT_PATH = '/pre-tournament'

type PreTournamentPickStatus = {
  winner_team?: string | null
  top_scorer?: string | null
} | null

export function hasCompletedPreTournamentPick(pick: PreTournamentPickStatus): boolean {
  return Boolean(pick?.winner_team && pick?.top_scorer)
}

export function shouldRequirePreTournamentPick(pathname: string, hasPick: boolean): boolean {
  return pathname === '/predict' && !hasPick
}
