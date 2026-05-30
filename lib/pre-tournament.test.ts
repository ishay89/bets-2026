import { describe, expect, it } from 'vitest'
import { hasCompletedPreTournamentPick } from './pre-tournament'

describe('hasCompletedPreTournamentPick', () => {
  it('requires both a winner team and a top scorer', () => {
    expect(hasCompletedPreTournamentPick(null)).toBe(false)
    expect(hasCompletedPreTournamentPick({ winner_team: 'Argentina', top_scorer: null })).toBe(false)
    expect(hasCompletedPreTournamentPick({ winner_team: null, top_scorer: 'K. Mbappe' })).toBe(false)
    expect(hasCompletedPreTournamentPick({ winner_team: 'Argentina', top_scorer: 'K. Mbappe' })).toBe(true)
  })
})
