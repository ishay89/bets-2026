import { describe, expect, it } from 'vitest'
import {
  hasCompletedPreTournamentPick,
  withCurrentFuturesOdds,
  TEAMS,
  SCORERS,
} from './pre-tournament'

describe('hasCompletedPreTournamentPick', () => {
  it('requires both a winner team and a top scorer', () => {
    expect(hasCompletedPreTournamentPick(null)).toBe(false)
    expect(hasCompletedPreTournamentPick({ winner_team: 'Argentina', top_scorer: null })).toBe(false)
    expect(hasCompletedPreTournamentPick({ winner_team: null, top_scorer: 'K. Mbappe' })).toBe(false)
    expect(hasCompletedPreTournamentPick({ winner_team: 'Argentina', top_scorer: 'K. Mbappe' })).toBe(true)
  })
})

describe('withCurrentFuturesOdds', () => {
  const brazil = TEAMS.find(t => t.name === 'Brazil')!
  const mbappe = SCORERS.find(s => s.name === 'Kylian Mbappé')!

  it('refreshes stale stored odds to the current list odds by name', () => {
    const refreshed = withCurrentFuturesOdds({
      id: 'p1',
      winner_team: 'Brazil',
      winner_odds: 5.0, // snapshot from before the odds were refreshed
      top_scorer: 'Kylian Mbappé',
      top_scorer_odds: 99, // stale snapshot
    })
    expect(refreshed.winner_odds).toBe(brazil.odds)
    expect(refreshed.top_scorer_odds).toBe(mbappe.odds)
  })

  it('keeps the stored odds when the name is no longer listed', () => {
    const refreshed = withCurrentFuturesOdds({
      winner_team: 'Atlantis',
      winner_odds: 12.34,
      top_scorer: 'Nobody',
      top_scorer_odds: 56.78,
    })
    expect(refreshed.winner_odds).toBe(12.34)
    expect(refreshed.top_scorer_odds).toBe(56.78)
  })

  it('preserves all other fields on the pick', () => {
    const refreshed = withCurrentFuturesOdds({
      id: 'p2',
      winner_team: 'Brazil',
      winner_odds: 1,
      top_scorer: 'Kylian Mbappé',
      top_scorer_odds: 1,
    })
    expect(refreshed.id).toBe('p2')
  })
})
