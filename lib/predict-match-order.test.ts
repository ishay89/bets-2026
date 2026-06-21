import { describe, expect, it } from 'vitest'
import { getPredictLiveRefreshMatchIds, sortPredictDayBets, sortPredictMatchDays, sortPredictMatches } from './predict-match-order'
import type { FullMatchDay } from './data'
import type { Match, Pikanteria } from './types'

const NOW = new Date('2026-06-17T18:00:00Z').getTime()

function match(overrides: Partial<Match> & { id: string; kickoff_time: string }): Match {
  return {
    id: overrides.id,
    match_day_id: overrides.match_day_id ?? 'day-1',
    home_team: overrides.home_team ?? 'Home',
    away_team: overrides.away_team ?? 'Away',
    kickoff_time: overrides.kickoff_time,
    odds_home: overrides.odds_home ?? 1.5,
    odds_draw: overrides.odds_draw ?? 3,
    odds_away: overrides.odds_away ?? 2.5,
    result: overrides.result ?? null,
    locked: overrides.locked ?? false,
    published_at: overrides.published_at ?? '2026-06-17T08:00:00Z',
    live_status: overrides.live_status ?? null,
    live_score_home: overrides.live_score_home ?? null,
    live_score_away: overrides.live_score_away ?? null,
    live_minute: overrides.live_minute ?? null,
    live_synced_at: overrides.live_synced_at ?? null,
  }
}

function pikanteria(overrides: Partial<Pikanteria> & { id: string; kickoff_time: string | null }): Pikanteria {
  return {
    id: overrides.id,
    match_day_id: overrides.match_day_id ?? 'day-1',
    question: overrides.question ?? 'Question?',
    label_1: overrides.label_1 ?? 'Yes',
    label_2: overrides.label_2 ?? 'No',
    label_x: overrides.label_x ?? null,
    odds_1: overrides.odds_1 ?? 1.8,
    odds_2: overrides.odds_2 ?? 2.1,
    odds_x: overrides.odds_x ?? null,
    result: overrides.result ?? null,
    locked: overrides.locked ?? false,
    kickoff_time: overrides.kickoff_time,
    created_at: overrides.created_at ?? '2026-06-17T08:00:00Z',
    published_at: overrides.published_at ?? '2026-06-17T08:00:00Z',
  }
}

function day(overrides: Partial<FullMatchDay> & { id: string; date: string; matches: Match[] }): FullMatchDay {
  return {
    id: overrides.id,
    date: overrides.date,
    stage: overrides.stage ?? 'group',
    lock_time: overrides.lock_time ?? '2026-06-17T17:55:00Z',
    locked: overrides.locked ?? false,
    published_at: overrides.published_at ?? '2026-06-17T08:00:00Z',
    created_at: overrides.created_at ?? '2026-06-01T00:00:00Z',
    matches: overrides.matches,
    pikanteria: overrides.pikanteria ?? [],
  }
}

describe('sortPredictMatches', () => {
  it('orders live matches before upcoming matches and already-played matches', () => {
    const matches = [
      match({ id: 'played', kickoff_time: '2026-06-17T15:00:00Z', result: '1' }),
      match({ id: 'upcoming-late', kickoff_time: '2026-06-17T21:00:00Z' }),
      match({ id: 'live', kickoff_time: '2026-06-17T17:00:00Z', live_status: 'IN_PLAY' }),
      match({ id: 'upcoming-early', kickoff_time: '2026-06-17T19:00:00Z' }),
    ]

    expect(sortPredictMatches(matches, NOW).map(item => item.id)).toEqual([
      'live',
      'upcoming-early',
      'upcoming-late',
      'played',
    ])
  })
})

describe('sortPredictDayBets', () => {
  it('groups matches and pikanteria by kickoff while keeping live matches first', () => {
    const matchDay = day({
      id: 'mixed-day',
      date: '2026-06-17',
      matches: [
        match({ id: 'played-early', kickoff_time: '2026-06-17T15:00:00Z', result: '1' }),
        match({ id: 'live', kickoff_time: '2026-06-17T17:00:00Z', live_status: 'IN_PLAY' }),
        match({ id: 'late-match', kickoff_time: '2026-06-17T21:00:00Z' }),
      ],
      pikanteria: [
        pikanteria({ id: 'middle-pika', kickoff_time: '2026-06-17T19:00:00Z' }),
        pikanteria({ id: 'early-pika', kickoff_time: '2026-06-17T16:00:00Z' }),
      ],
    })

    expect(sortPredictDayBets(matchDay).map(item => `${item.kind}:${item.bet.id}`)).toEqual([
      'match:live',
      'match:played-early',
      'pikanteria:early-pika',
      'pikanteria:middle-pika',
      'match:late-match',
    ])
  })
})

describe('sortPredictMatchDays', () => {
  it('moves a day with a live match above upcoming-only days and played days', () => {
    const playedDay = day({
      id: 'played-day',
      date: '2026-06-16',
      matches: [match({ id: 'played', kickoff_time: '2026-06-16T20:00:00Z', result: '2' })],
    })
    const upcomingDay = day({
      id: 'upcoming-day',
      date: '2026-06-17',
      matches: [match({ id: 'upcoming', kickoff_time: '2026-06-17T21:00:00Z' })],
    })
    const liveDay = day({
      id: 'live-day',
      date: '2026-06-17',
      matches: [match({ id: 'live', kickoff_time: '2026-06-17T17:00:00Z', live_status: 'PAUSED' })],
    })

    expect(sortPredictMatchDays([playedDay, upcomingDay, liveDay], NOW).map(item => item.id)).toEqual([
      'live-day',
      'upcoming-day',
      'played-day',
    ])
  })
})

describe('getPredictLiveRefreshMatchIds', () => {
  it('returns published unscored matches in the live refresh window', () => {
    const refreshDay = day({
      id: 'refresh-day',
      date: '2026-06-17',
      matches: [
        match({ id: 'recent-kickoff', kickoff_time: '2026-06-17T17:30:00Z' }),
        match({ id: 'starting-soon', kickoff_time: '2026-06-17T18:08:00Z' }),
        match({ id: 'finished', kickoff_time: '2026-06-17T16:00:00Z', result: 'X' }),
        match({ id: 'too-late', kickoff_time: '2026-06-17T18:30:00Z' }),
        match({ id: 'too-old', kickoff_time: '2026-06-17T15:00:00Z' }),
      ],
    })

    expect(getPredictLiveRefreshMatchIds([refreshDay], NOW).toSorted()).toEqual([
      'recent-kickoff',
      'starting-soon',
    ].toSorted())
  })
})
