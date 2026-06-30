import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeTeamName,
  canonicalTeamKey,
  fetchFinishedMatches,
  fdNinetyMinuteScore,
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

  it('derives the 90-minute score by removing extra-time goals when regularTime is missing', () => {
    const providerScore = score(2, 1, {
      winner: 'HOME_TEAM',
      duration: 'EXTRA_TIME',
      regularTime: { home: null, away: null },
      extraTime: { home: 1, away: 0 },
    })

    expect(fdNinetyMinuteScore(providerScore)).toEqual({ home: 1, away: 1 })
    expect(fdScoreToPick(providerScore)).toBe('X')
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

  it('accepts extra-time matches because our app settles after 90 minutes', () => {
    expect(isScorableFdMatch({
      ...fdMatch('PAUSED', 1, 1),
      score: score(1, 1, {
        winner: 'DRAW',
        duration: 'EXTRA_TIME',
        regularTime: { home: null, away: null },
        extraTime: { home: 0, away: 0 },
      }),
    })).toBe(true)
  })

  it('rejects regular half-time pauses, in-play regular time, or score-less matches', () => {
    expect(isScorableFdMatch(fdMatch('PAUSED', 1, 0))).toBe(false)
    expect(isScorableFdMatch(fdMatch('IN_PLAY', 1, 0))).toBe(false)
    expect(isScorableFdMatch(fdMatch('FINISHED', null, null))).toBe(false)
  })
})

describe('fetchFinishedMatches', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches all matches so post-regular-time games can settle before provider FINISHED', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        matches: [{
          ...fdMatch('PAUSED', 1, 1),
          score: score(1, 1, {
            winner: 'DRAW',
            duration: 'EXTRA_TIME',
            regularTime: { home: null, away: null },
            extraTime: { home: 0, away: 0 },
          }),
        }],
      })),
    )

    const matches = await fetchFinishedMatches({ apiKey: 'test-key', competition: 'WC' })

    expect(String(fetchMock.mock.calls[0][0])).not.toContain('status=FINISHED')
    expect(matches.map(match => match.id)).toEqual([1])
  })
})
