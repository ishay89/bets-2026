import { describe, expect, it } from 'vitest'
import { getEligibleScenarioTeams, type ScenarioKnockoutMatch } from './scenario-teams'

function match(overrides: Partial<ScenarioKnockoutMatch>): ScenarioKnockoutMatch {
  return {
    stage: 'qf',
    home_team: 'France',
    away_team: 'Morocco',
    result: null,
    live_score_home: null,
    live_score_away: null,
    ...overrides,
  }
}

describe('getEligibleScenarioTeams', () => {
  it('derives semifinalists from the latest completed round when future rows are placeholders', () => {
    const teams = getEligibleScenarioTeams([
      match({ home_team: 'France', away_team: 'Morocco', result: '1', live_score_home: 2, live_score_away: 0 }),
      match({ home_team: 'Spain', away_team: 'Belgium', result: '1', live_score_home: 2, live_score_away: 1 }),
      match({ home_team: 'Norway', away_team: 'England', result: 'X', live_score_home: 1, live_score_away: 2 }),
      match({ home_team: 'Argentina', away_team: 'Switzerland', result: 'X', live_score_home: 3, live_score_away: 1 }),
      match({ stage: 'sf', home_team: 'SF M1 · Home', away_team: 'SF M1 · Away' }),
      match({ stage: 'final', home_team: 'Final M1 · Home', away_team: 'Final M1 · Away' }),
    ])

    expect(teams).toEqual(['France', 'Spain', 'England', 'Argentina'])
  })

  it('keeps a round winner alongside teams whose match in that round is still open', () => {
    const teams = getEligibleScenarioTeams([
      match({ stage: 'sf', home_team: 'France', away_team: 'Spain', result: '1', live_score_home: 2, live_score_away: 1 }),
      match({ stage: 'sf', home_team: 'England', away_team: 'Argentina' }),
      match({ stage: 'final', home_team: 'Final M1 · Home', away_team: 'Final M1 · Away' }),
    ])

    expect(teams).toEqual(['France', 'England', 'Argentina'])
  })

  it('returns no teams once the final is complete', () => {
    expect(getEligibleScenarioTeams([
      match({ stage: 'final', home_team: 'France', away_team: 'Spain', result: '1' }),
    ])).toEqual([])
  })
})
