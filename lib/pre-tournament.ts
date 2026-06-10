export const TEAMS = [
  { name: "France", odds: 4.5 },
  { name: "Spain", odds: 4.5 },
  { name: "Portugal", odds: 6.0 },
  { name: "England", odds: 7.0 },
  { name: "Brazil", odds: 7.0 },
  { name: "Argentina", odds: 8.0 },
  { name: "Germany", odds: 14.0 },
  { name: "Netherlands", odds: 15.0 },
  { name: "Norway", odds: 22.0 },
  { name: "Belgium", odds: 30.0 },
  { name: "Colombia", odds: 30.0 },
  { name: "Japan", odds: 45.0 },
  { name: "Morocco", odds: 45.0 },
  { name: "Uruguay", odds: 55.0 },
  { name: "USA", odds: 55.0 },
  { name: "Switzerland", odds: 65.0 },
  { name: "Mexico", odds: 65.0 },
  { name: "Croatia", odds: 65.0 },
  { name: "Turkey", odds: 70.0 },
  { name: "Ecuador", odds: 90.0 },
  { name: "Senegal", odds: 100.0 },
  { name: "Other", odds: 100.0 },
  { name: "Sweden", odds: 110.0 },
  { name: "Austria", odds: 120.0 },
  { name: "Paraguay", odds: 120.0 },
  { name: "Canada", odds: 120.0 },
  { name: "Scotland", odds: 200.0 },
  { name: "Ivory Coast", odds: 200.0 },
  { name: "Bosnia & Herzegovina", odds: 250.0 },
  { name: "Egypt", odds: 250.0 },
  { name: "South Korea", odds: 250.0 },
  { name: "Czech Republic", odds: 250.0 },
  { name: "Algeria", odds: 300.0 },
  { name: "Ghana", odds: 300.0 },
] as const;

export const SCORERS = [
  { name: "Kylian Mbappé", odds: 5.0 },
  { name: "Harry Kane", odds: 6.5 },
  { name: "Other", odds: 8.0 },
  { name: "Erling Haaland", odds: 12.0 },
  { name: "Mikel Oyarzabal", odds: 12.0 },
  { name: "Cristiano Ronaldo", odds: 15.0 },
  { name: "Leo Messi", odds: 15.0 },
  { name: "Julián Álvarez", odds: 20.0 },
  { name: "Michael Olise", odds: 20.0 },
  { name: "Kai Havertz", odds: 20.0 },
  { name: "Lamine Yamal", odds: 22.0 },
  { name: "Raphinha", odds: 22.0 },
  { name: "Vinicius Jr.", odds: 25.0 },
  { name: "Ousmane Dembélé", odds: 30.0 },
  { name: "Lautaro Martínez", odds: 30.0 },
  { name: "Arda Güler", odds: 40.0 },
  { name: "Romelu Lukaku", odds: 40.0 },
  { name: "Cody Gakpo", odds: 40.0 },
  { name: "Bukayo Saka", odds: 50.0 },
  { name: "Luis Suárez", odds: 40.0 },
  { name: "Florian Wirtz", odds: 40.0 },
  { name: "Dani Olmo", odds: 45.0 },
  { name: "Luis Díaz", odds: 45.0 },
  { name: "Ferran Torres", odds: 40.0 },
  { name: "Bruno Fernandes", odds: 50.0 },
  { name: "Jonathan David", odds: 50.0 },
  { name: "Memphis Depay", odds: 50.0 },
  { name: "Darwin Núñez", odds: 55.0 },
  { name: "Jamal Musiala", odds: 55.0 },
  { name: "Gonçalo Ramos", odds: 60.0 },
  { name: "Son Heung-min", odds: 60.0 },
  { name: "Brahim Díaz", odds: 60.0 },
  { name: "Donyell Malen", odds: 60.0 },
  { name: "Mohamed Salah", odds: 60.0 },
  { name: "Viktor Gyökeres", odds: 60.0 },
  { name: "Neymar", odds: 65.0 },
  { name: "Sadio Mané", odds: 65.0 },
  { name: "Nico Williams", odds: 70.0 },
  { name: "Alexander Sørloth", odds: 70.0 },
  { name: "Christian Pulisic", odds: 70.0 },
] as const;

export const TEAM_NAMES = TEAMS.map((t) => t.name);
export const SCORER_NAMES = SCORERS.map((s) => s.name);

/** Current odds for a team by name, or undefined if no longer listed. */
function teamOdds(name: string): number | undefined {
  return TEAMS.find((t) => t.name === name)?.odds;
}

/** Current odds for a top-scorer candidate by name, or undefined if no longer listed. */
function scorerOdds(name: string): number | undefined {
  return SCORERS.find((s) => s.name === name)?.odds;
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
export function withCurrentFuturesOdds<
  T extends {
    winner_team: string;
    winner_odds: number;
    top_scorer: string;
    top_scorer_odds: number;
  },
>(pick: T): T {
  return {
    ...pick,
    winner_odds: teamOdds(pick.winner_team) ?? pick.winner_odds,
    top_scorer_odds: scorerOdds(pick.top_scorer) ?? pick.top_scorer_odds,
  };
}

type PreTournamentPickStatus = {
  winner_team?: string | null;
  top_scorer?: string | null;
} | null;

export function hasCompletedPreTournamentPick(
  pick: PreTournamentPickStatus,
): boolean {
  return Boolean(pick?.winner_team && pick?.top_scorer);
}
