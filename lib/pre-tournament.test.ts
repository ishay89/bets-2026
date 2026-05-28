import { describe, expect, it } from 'vitest'
import {
  hasCompletedPreTournamentPick,
  shouldRequirePreTournamentPick,
} from './pre-tournament'

describe('hasCompletedPreTournamentPick', () => {
  it('requires both a winner team and a top scorer', () => {
    expect(hasCompletedPreTournamentPick(null)).toBe(false)
    expect(hasCompletedPreTournamentPick({ winner_team: 'Argentina', top_scorer: null })).toBe(false)
    expect(hasCompletedPreTournamentPick({ winner_team: null, top_scorer: 'K. Mbappe' })).toBe(false)
    expect(hasCompletedPreTournamentPick({ winner_team: 'Argentina', top_scorer: 'K. Mbappe' })).toBe(true)
  })
})

describe('shouldRequirePreTournamentPick', () => {
  it('requires the entry pick before daily predictions', () => {
    expect(shouldRequirePreTournamentPick('/predict', false)).toBe(true)
    expect(shouldRequirePreTournamentPick('/predict', true)).toBe(false)
  })

  it('does not require the entry pick on the entry pick page', () => {
    expect(shouldRequirePreTournamentPick('/pre-tournament', false)).toBe(false)
  })
})
