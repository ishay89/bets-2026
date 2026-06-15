import { describe, it, expect } from 'vitest'
import { reconcile, type InternalMatch } from './result-sync'
import type { FdMatch, FdScore } from './football-data'

function score(home: number, away: number): FdScore {
  return { winner: home > away ? 'HOME_TEAM' : home < away ? 'AWAY_TEAM' : 'DRAW', duration: 'REGULAR', fullTime: { home, away } }
}

function fd(id: number, home: string, away: string, utcDate: string, h: number, a: number): FdMatch {
  return {
    id, utcDate, status: 'FINISHED', stage: 'GROUP_STAGE', group: 'GROUP_A',
    homeTeam: { id: null, name: home }, awayTeam: { id: null, name: away }, score: score(h, a),
  }
}

const m = (id: string, home: string, away: string, kickoff: string, result: InternalMatch['result'] = null): InternalMatch =>
  ({ id, home_team: home, away_team: away, kickoff_time: kickoff, result })

describe('reconcile', () => {
  it('matches by team pair across name variants and builds a suggestion', () => {
    const internal = [m('a', 'Czechia', 'South Korea', '2026-06-12T05:00:00+03:00')]
    const fdMatches = [fd(100, 'Korea Republic', 'Czech Republic', '2026-06-12T02:00:00Z', 0, 2)]
    // Provider has home/away in a different order than our fixture — pair is
    // order-sensitive, so this should NOT match.
    const { suggestions, unmatched } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(0)
    expect(unmatched).toHaveLength(1)
  })

  it('matches when home/away order agrees', () => {
    const internal = [m('a', 'South Korea', 'Czechia', '2026-06-12T05:00:00+03:00')]
    const fdMatches = [fd(100, 'Korea Republic', 'Czech Republic', '2026-06-12T02:00:00Z', 0, 2)]
    const { suggestions } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      match_id: 'a', suggested_result: '2', home_score: 0, away_score: 2, external_match_id: 100,
    })
  })

  it('skips already-scored internal matches', () => {
    const internal = [m('a', 'Mexico', 'South Africa', '2026-06-11T22:00:00+03:00', '1')]
    const fdMatches = [fd(100, 'Mexico', 'South Africa', '2026-06-11T19:00:00Z', 1, 0)]
    const { suggestions, unmatched } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(0)
    expect(unmatched).toHaveLength(1)
  })

  it('disambiguates a repeated pairing by kickoff proximity', () => {
    const internal = [
      m('early', 'Brazil', 'Morocco', '2026-06-13T22:00:00+03:00'),
      m('late', 'Brazil', 'Morocco', '2026-07-01T22:00:00+03:00'),
    ]
    const fdMatches = [fd(100, 'Brazil', 'Morocco', '2026-06-13T19:00:00Z', 3, 1)]
    const { suggestions } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].match_id).toBe('early')
  })

  it('does not match outside the date tolerance', () => {
    const internal = [m('a', 'Brazil', 'Morocco', '2026-06-13T22:00:00+03:00')]
    const fdMatches = [fd(100, 'Brazil', 'Morocco', '2026-08-01T19:00:00Z', 3, 1)]
    const { suggestions, unmatched } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(0)
    expect(unmatched).toHaveLength(1)
  })

  it('reports finished provider matches with no internal fixture as unmatched', () => {
    const internal: InternalMatch[] = []
    const fdMatches = [fd(100, 'Spain', 'Uruguay', '2026-06-14T19:00:00Z', 2, 2)]
    const { suggestions, unmatched } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(0)
    expect(unmatched[0]).toMatchObject({ home: 'Spain', away: 'Uruguay' })
  })
})
