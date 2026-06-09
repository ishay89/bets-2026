export const TEAMS = [
  { name: 'France', odds: 4.50 },
  { name: 'Spain', odds: 5.00 },
  { name: 'England', odds: 6.50 },
  { name: 'Argentina', odds: 7.00 },
  { name: 'Brazil', odds: 7.00 },
  { name: 'Portugal', odds: 7.00 },
  { name: 'Germany', odds: 13.00 },
  { name: 'Netherlands', odds: 19.00 },
  { name: 'Norway', odds: 24.00 },
  { name: 'Belgium', odds: 30.00 },
  { name: 'Colombia', odds: 30.00 },
  { name: 'Japan', odds: 45.00 },
  { name: 'Morocco', odds: 45.00 },
  { name: 'Uruguay', odds: 55.00 },
  { name: 'USA', odds: 55.00 },
  { name: 'Switzerland', odds: 60.00 },
  { name: 'Mexico', odds: 65.00 },
  { name: 'Croatia', odds: 65.00 },
  { name: 'Turkey', odds: 70.00 },
  { name: 'Ecuador', odds: 90.00 },
  { name: 'Senegal', odds: 100.00 },
  { name: 'Other', odds: 100.00 },
  { name: 'Sweden', odds: 110.00 },
  { name: 'Austria', odds: 120.00 },
  { name: 'Paraguay', odds: 120.00 },
  { name: 'Canada', odds: 120.00 },
  { name: 'Bosnia & Herzegovina', odds: 200.00 },
  { name: 'Scotland', odds: 200.00 },
  { name: 'Ivory Coast', odds: 250.00 },
  { name: 'Egypt', odds: 250.00 },
  { name: 'Czech Republic', odds: 250.00 },
  { name: 'Algeria', odds: 300.00 },
  { name: 'Ghana', odds: 300.00 },
  { name: 'South Korea', odds: 400.00 },
] as const

export const SCORERS = [
  { name: 'Other/Field', odds: 5.00 },
  { name: 'Kylian Mbappé', odds: 5.50 },
  { name: 'Harry Kane', odds: 8.00 },
  { name: 'Leo Messi', odds: 13.00 },
  { name: 'Erling Haaland', odds: 15.00 },
  { name: 'Lamine Yamal', odds: 15.00 },
  { name: 'Mikel Oyarzabal', odds: 15.00 },
  { name: 'Cristiano Ronaldo', odds: 18.00 },
  { name: 'Ousmane Dembélé', odds: 20.00 },
  { name: 'Vinicius Jr.', odds: 25.00 },
  { name: 'Lautaro Martínez', odds: 25.00 },
  { name: 'Raphinha', odds: 25.00 },
  { name: 'Dani Olmo', odds: 35.00 },
  { name: 'Cody Gakpo', odds: 35.00 },
  { name: 'Romelu Lukaku', odds: 35.00 },
  { name: 'Arda Güler', odds: 40.00 },
  { name: 'Bukayo Saka', odds: 40.00 },
  { name: 'Jamal Musiala', odds: 40.00 },
  { name: 'Darwin Núñez', odds: 40.00 },
  { name: 'Julián Álvarez', odds: 40.00 },
  { name: 'Christian Pulisic', odds: 40.00 },
  { name: 'Luis Díaz', odds: 40.00 },
  { name: 'Luis Suárez', odds: 40.00 },
  { name: 'Nico Williams', odds: 40.00 },
  { name: 'Florian Wirtz', odds: 40.00 },
  { name: 'Ferran Torres', odds: 40.00 },
  { name: 'Kai Havertz', odds: 40.00 },
  { name: 'Alexander Sørloth', odds: 50.00 },
  { name: 'Brahim Díaz', odds: 50.00 },
  { name: 'Bruno Fernandes', odds: 50.00 },
  { name: 'Jonathan David', odds: 50.00 },
  { name: 'Donyell Malen', odds: 50.00 },
  { name: 'Viktor Gyökeres', odds: 50.00 },
  { name: 'Mohamed Salah', odds: 50.00 },
  { name: 'Michael Olise', odds: 50.00 },
  { name: 'Memphis Depay', odds: 50.00 },
  { name: 'Gonçalo Ramos', odds: 60.00 },
  { name: 'Son Heung-min', odds: 60.00 },
  { name: 'Neymar', odds: 60.00 },
  { name: 'Sadio Mané', odds: 60.00 },
] as const

export const TEAM_NAMES = TEAMS.map(t => t.name)
export const SCORER_NAMES = SCORERS.map(s => s.name)

/** Current odds for a team by name, or undefined if no longer listed. */
function teamOdds(name: string): number | undefined {
  return TEAMS.find(t => t.name === name)?.odds
}

/** Current odds for a top-scorer candidate by name, or undefined if no longer listed. */
function scorerOdds(name: string): number | undefined {
  return SCORERS.find(s => s.name === name)?.odds
}

/**
 * Re-derive a futures pick's odds from the canonical TEAMS / SCORERS lists.
 *
 * The `winner_odds` / `top_scorer_odds` stored on a pick are only a snapshot
 * taken when the pick was saved, so they go stale whenever the odds lists are
 * refreshed (e.g. a team's price moves after a player already locked it in).
 * Looking the odds back up by name — falling back to the stored snapshot only
 * if the name is no longer listed — keeps the displayed points and the points
 * actually awarded at tournament close in agreement with the live odds.
 */
export function withCurrentFuturesOdds<T extends {
  winner_team: string
  winner_odds: number
  top_scorer: string
  top_scorer_odds: number
}>(pick: T): T {
  return {
    ...pick,
    winner_odds: teamOdds(pick.winner_team) ?? pick.winner_odds,
    top_scorer_odds: scorerOdds(pick.top_scorer) ?? pick.top_scorer_odds,
  }
}

type PreTournamentPickStatus = {
  winner_team?: string | null
  top_scorer?: string | null
} | null

export function hasCompletedPreTournamentPick(pick: PreTournamentPickStatus): boolean {
  return Boolean(pick?.winner_team && pick?.top_scorer)
}

