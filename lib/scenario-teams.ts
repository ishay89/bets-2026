import { TEAM_NAMES, TEAMS } from './pre-tournament'
import type { Pick, Stage } from './types'

export interface ScenarioKnockoutMatch {
  stage: Stage
  home_team: string
  away_team: string
  result: Pick | null
  live_score_home: number | null
  live_score_away: number | null
}

const KNOCKOUT_STAGES: Stage[] = ['r32', 'r16', 'qf', 'sf', 'final']
const listedTeams = new Set<string>(TEAM_NAMES)

function listedTeam(name: string): string | null {
  return listedTeams.has(name) && name !== 'Other' ? name : null
}

/**
 * Whether a knockout match has produced an actual winner (the team that
 * advances / lifts the trophy), as opposed to a settled 1X2 bet.
 *
 * A decisive 90-minute result ('1'/'2') is enough. A draw at 90' settles the
 * bet as 'X' the moment regulation ends, but the tie is still live through
 * extra time and penalties — it is only decided once a decisive live score
 * reflects that outcome. This keeps scenarios open while a level final is
 * still being played, and locks them only when the futures are truly set.
 */
function isDecided(match: ScenarioKnockoutMatch): boolean {
  if (match.result == null) return false
  if (match.result === '1' || match.result === '2') return true
  return (
    match.live_score_home != null
    && match.live_score_away != null
    && match.live_score_home !== match.live_score_away
  )
}

function matchWinner(match: ScenarioKnockoutMatch): string | null {
  if (
    match.live_score_home != null
    && match.live_score_away != null
    && match.live_score_home !== match.live_score_away
  ) {
    return listedTeam(match.live_score_home > match.live_score_away ? match.home_team : match.away_team)
  }
  if (match.result === '1') return listedTeam(match.home_team)
  if (match.result === '2') return listedTeam(match.away_team)
  return null
}

function inCanonicalOrder(teams: ReadonlySet<string>): string[] {
  return TEAMS.map(team => team.name).filter(team => teams.has(team))
}

/**
 * Finds teams that can still reach the final.
 *
 * Real participants from an active knockout round are preferred. When the
 * next round still contains seeded placeholders, winners from the latest
 * completed round are used instead. A completed match and an unplayed match
 * can coexist in the same round, so both its winner and remaining participants
 * are kept during that transition.
 */
export function getEligibleScenarioTeams(matches: readonly ScenarioKnockoutMatch[]): string[] {
  const hasUndecidedKnockout = matches.some(match => (
    KNOCKOUT_STAGES.includes(match.stage) && !isDecided(match)
  ))
  if (!hasUndecidedKnockout) return []

  for (const stage of [...KNOCKOUT_STAGES].reverse()) {
    const round = matches.filter(match => match.stage === stage)
    if (round.length === 0) continue

    const eligible = new Set<string>()
    for (const match of round) {
      if (!isDecided(match)) {
        const home = listedTeam(match.home_team)
        const away = listedTeam(match.away_team)
        if (home) eligible.add(home)
        if (away) eligible.add(away)
      } else {
        const winner = matchWinner(match)
        if (winner) eligible.add(winner)
      }
    }

    if (eligible.size > 0) return inCanonicalOrder(eligible)
  }

  return []
}
