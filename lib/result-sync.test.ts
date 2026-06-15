import { describe, it, expect } from 'vitest'
import { reconcile, type InternalMatch } from './result-sync'
import type { FdMatch, FdScore } from './football-data'

function score(home: number, away: number): FdScore {
  return { winner: home > away ? 'HOME_TEAM' : home < away ? 'AWAY_TEAM' : 'DRAW', duration: 'REGULAR', fullTime: { home, away } }
}

function fd(id: number, home: string | null, away: string | null, utcDate: string, h: number, a: number): FdMatch {
  return {
    id, utcDate, status: 'FINISHED', stage: 'GROUP_STAGE', group: 'GROUP_A',
    homeTeam: { id: null, name: home }, awayTeam: { id: null, name: away }, score: score(h, a),
  }
}

const m = (
  id: string, home: string, away: string, kickoff: string,
  result: InternalMatch['result'] = null, external_match_id: number | null = null,
): InternalMatch => ({ id, home_team: home, away_team: away, kickoff_time: kickoff, result, external_match_id })

describe('reconcile — id matching', () => {
  it('matches by external_match_id exactly, ignoring names/dates', () => {
    // Placeholder team names + a wrong-looking date: id still wins.
    const internal = [m('a', 'R32 M1 · Home', 'R32 M1 · Away', '2026-07-01T00:00:00Z', null, 537417)]
    const fdMatches = [fd(537417, 'Brazil', 'France', '2026-06-29T19:00:00Z', 2, 1)]
    const { suggestions } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({ match_id: 'a', suggested_result: '1', external_match_id: 537417 })
  })

  it('does NOT name-match a row that already carries a (different) id', () => {
    // Row is id-mapped to 999; provider game 111 has the same pairing but a
    // different id — must not be assigned by name.
    const internal = [m('a', 'Spain', 'Uruguay', '2026-06-26T21:00:00Z', null, 999)]
    const fdMatches = [fd(111, 'Spain', 'Uruguay', '2026-06-26T21:00:00Z', 1, 0)]
    const { suggestions, unmatched } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(0)
    expect(unmatched).toHaveLength(1)
  })

  it('id match takes precedence even when another row could name-match', () => {
    const internal = [
      m('mapped', 'PLACEHOLDER', 'PLACEHOLDER', '2026-06-20T00:00:00Z', null, 500),
      m('named', 'Brazil', 'Morocco', '2026-06-13T19:00:00Z'),
    ]
    const fdMatches = [
      fd(500, 'Brazil', 'Morocco', '2026-06-13T19:00:00Z', 3, 1), // id hits 'mapped'
    ]
    const { suggestions } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].match_id).toBe('mapped')
  })
})

describe('reconcile — name/date fallback (unmapped rows)', () => {
  it('matches when home/away order agrees', () => {
    const internal = [m('a', 'South Korea', 'Czechia', '2026-06-12T05:00:00+03:00')]
    const fdMatches = [fd(100, 'Korea Republic', 'Czech Republic', '2026-06-12T02:00:00Z', 0, 2)]
    const { suggestions } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({ match_id: 'a', suggested_result: '2', external_match_id: 100 })
  })

  it('does not match when home/away order differs', () => {
    const internal = [m('a', 'Czechia', 'South Korea', '2026-06-12T05:00:00+03:00')]
    const fdMatches = [fd(100, 'Korea Republic', 'Czech Republic', '2026-06-12T02:00:00Z', 0, 2)]
    const { suggestions, unmatched } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(0)
    expect(unmatched).toHaveLength(1)
  })

  it('matches Cape Verde Islands (provider) to Cabo Verde (seed)', () => {
    const internal = [m('a', 'Spain', 'Cabo Verde', '2026-06-15T19:00:00Z')]
    const fdMatches = [fd(100, 'Spain', 'Cape Verde Islands', '2026-06-15T16:00:00Z', 3, 0)]
    const { suggestions } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].match_id).toBe('a')
  })

  it('skips already-scored internal matches', () => {
    const internal = [m('a', 'Mexico', 'South Africa', '2026-06-11T22:00:00+03:00', '1')]
    const fdMatches = [fd(100, 'Mexico', 'South Africa', '2026-06-11T19:00:00Z', 1, 0)]
    const { suggestions } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(0)
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

  it('reports finished provider matches with no internal fixture as unmatched', () => {
    const internal: InternalMatch[] = []
    const fdMatches = [fd(100, 'Spain', 'Uruguay', '2026-06-14T19:00:00Z', 2, 2)]
    const { suggestions, unmatched } = reconcile(internal, fdMatches)
    expect(suggestions).toHaveLength(0)
    expect(unmatched[0]).toMatchObject({ home: 'Spain', away: 'Uruguay' })
  })
})
