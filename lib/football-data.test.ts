import { describe, it, expect } from 'vitest'
import {
  normalizeTeamName,
  canonicalTeamKey,
  fdScoreToPick,
  isScorableFdMatch,
  type FdMatch,
  type FdScore,
} from './football-data'

describe('normalizeTeamName', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeTeamName("Côte d'Ivoire")).toBe('cote d ivoire')
    expect(normalizeTeamName('Türkiye')).toBe('turkiye')
    expect(normalizeTeamName('Curaçao')).toBe('curacao')
    expect(normalizeTeamName('Bosnia-Herzegovina')).toBe('bosnia herzegovina')
  })
})

describe('canonicalTeamKey', () => {
  it('maps seed and provider variants to the same canonical key', () => {
    expect(canonicalTeamKey('Czechia')).toBe(canonicalTeamKey('Czech Republic'))
    expect(canonicalTeamKey('Türkiye')).toBe(canonicalTeamKey('Turkey'))
    expect(canonicalTeamKey("Côte d'Ivoire")).toBe(canonicalTeamKey('Ivory Coast'))
    expect(canonicalTeamKey('South Korea')).toBe(canonicalTeamKey('Korea Republic'))
    expect(canonicalTeamKey('Cabo Verde')).toBe(canonicalTeamKey('Cape Verde'))
  })

  it('leaves unmapped names as their normalized form', () => {
    expect(canonicalTeamKey('Brazil')).toBe('brazil')
    expect(canonicalTeamKey('Brazil')).not.toBe(canonicalTeamKey('Argentina'))
  })
})

function score(home: number | null, away: number | null, extra: Partial<FdScore> = {}): FdScore {
  return { winner: null, duration: 'REGULAR', fullTime: { home, away }, ...extra }
}

describe('fdScoreToPick', () => {
  it('maps home win / away win / draw from the 90-minute score', () => {
    expect(fdScoreToPick(score(2, 1))).toBe('1')
    expect(fdScoreToPick(score(0, 3))).toBe('2')
    expect(fdScoreToPick(score(1, 1))).toBe('X')
  })

  it('uses a drawn 90-minute score even when a knockout is decided on penalties', () => {
    // 1-1 after 90 minutes, home advances on penalties — the bet outcome is X.
    expect(fdScoreToPick(score(1, 1, { winner: 'HOME_TEAM', duration: 'PENALTY_SHOOTOUT' }))).toBe('X')
  })

  it('uses the regular-time score when the provider includes extra time or penalties in fullTime', () => {
    expect(fdScoreToPick(score(4, 5, {
      winner: null,
      duration: 'PENALTY_SHOOTOUT',
      regularTime: { home: 1, away: 1 },
      extraTime: { home: 0, away: 0 },
      penalties: { home: 4, away: 4 },
    } as Partial<FdScore>))).toBe('X')
  })

  it('returns null when the score is incomplete', () => {
    expect(fdScoreToPick(score(null, null))).toBeNull()
    expect(fdScoreToPick(score(1, null))).toBeNull()
  })
})

function fdMatch(status: string, home: number | null, away: number | null): FdMatch {
  return {
    id: 1,
    utcDate: '2026-06-11T19:00:00Z',
    status,
    stage: 'GROUP_STAGE',
    group: 'GROUP_A',
    homeTeam: { id: 1, name: 'Mexico' },
    awayTeam: { id: 2, name: 'South Africa' },
    score: score(home, away),
  }
}

describe('isScorableFdMatch', () => {
  it('accepts finished matches with a complete score', () => {
    expect(isScorableFdMatch(fdMatch('FINISHED', 2, 1))).toBe(true)
  })

  it('rejects in-play or score-less matches', () => {
    expect(isScorableFdMatch(fdMatch('IN_PLAY', 1, 0))).toBe(false)
    expect(isScorableFdMatch(fdMatch('FINISHED', null, null))).toBe(false)
  })
})
