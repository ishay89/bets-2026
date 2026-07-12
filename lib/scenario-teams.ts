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
  const hasUnscoredKnockout = matches.some(match => (
    KNOCKOUT_STAGES.includes(match.stage) && match.result == null
  ))
  if (!hasUnscoredKnockout) return []

  for (const stage of [...KNOCKOUT_STAGES].reverse()) {
    const round = matches.filter(match => match.stage === stage)
    if (round.length === 0) continue

    const eligible = new Set<string>()
    for (const match of round) {
      if (match.result == null) {
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
