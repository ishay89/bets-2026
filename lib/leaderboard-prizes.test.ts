import { describe, expect, it } from 'vitest'
import { computePotAssignments, isRealUser, PRIZES } from './leaderboard-prizes'
import type { LeaderboardEntry } from './types'

const CLAUDE_ID = '00000000-0000-0000-0000-000000000006'
const CODEX_ID = '00000000-0000-0000-0000-000000000005'

function entry(overrides: Partial<LeaderboardEntry> & Pick<LeaderboardEntry, 'id' | 'display_name'>): LeaderboardEntry {
  const { id, display_name, ...rest } = overrides
  return {
    id,
    display_name,
    is_monkey: false,
    automation_strategy: null,
    avatar_emoji: null,
    total_points: 0,
    today_points: 0,
    previous_total_points: null,
    current_rank: null,
    previous_rank: null,
    rank_delta: null,
    total_success_rate: null,
    total_successful_picks: 0,
    total_scored_picks: 0,
    today_success_rate: null,
    today_successful_picks: 0,
    today_scored_picks: 0,
    ...rest,
  }
}

function realUsers(count: number): LeaderboardEntry[] {
  return Array.from({ length: count }, (_, i) =>
    entry({ id: `real-${i + 1}`, display_name: `Real ${i + 1}` }),
  )
}

describe('isRealUser', () => {
  it('accepts a plain approved human', () => {
    expect(isRealUser(entry({ id: 'human', display_name: 'Human' }))).toBe(true)
  })

  it('rejects automated baseline markers and monkeys', () => {
    expect(isRealUser(entry({ id: 'max', display_name: 'Max', automation_strategy: 'max' }))).toBe(false)
    expect(isRealUser(entry({ id: 'mid', display_name: 'Mid', automation_strategy: 'mid' }))).toBe(false)
    expect(isRealUser(entry({ id: 'min', display_name: 'Min', automation_strategy: 'min' }))).toBe(false)
    expect(isRealUser(entry({ id: 'monkey', display_name: 'Monkey', is_monkey: true }))).toBe(false)
    expect(isRealUser(entry({ id: 'shadow', display_name: 'Shadow', automation_strategy: 'monkey' }))).toBe(false)
  })

  it('rejects Claude and Codex by their stable IDs even without automation flags', () => {
    expect(isRealUser(entry({ id: CLAUDE_ID, display_name: 'Claude' }))).toBe(false)
    expect(isRealUser(entry({ id: CODEX_ID, display_name: 'Codex' }))).toBe(false)
  })
})

describe('computePotAssignments', () => {
  it('pays the top five real users and fines the bottom two', () => {
    const { prizeByEntryId, fineByEntryId } = computePotAssignments(realUsers(8))

    expect(prizeByEntryId.get('real-1')).toBe(3400)
    expect(prizeByEntryId.get('real-2')).toBe(2380)
    expect(prizeByEntryId.get('real-3')).toBe(1020)
    expect(prizeByEntryId.get('real-4')).toBe(200)
    expect(prizeByEntryId.get('real-5')).toBe(100)
    expect(prizeByEntryId.size).toBe(5)

    expect(fineByEntryId.get('real-8')).toBe(200)
    expect(fineByEntryId.get('real-7')).toBe(100)
    expect(fineByEntryId.size).toBe(2)
  })

  it('skips markers, monkeys, Claude, and Codex without consuming prize or fine slots', () => {
    const standings = [
      entry({ id: 'real-1', display_name: 'Real 1' }),
      entry({ id: 'max', display_name: 'Always Max', automation_strategy: 'max' }),
      entry({ id: CLAUDE_ID, display_name: 'Claude' }),
      entry({ id: 'real-2', display_name: 'Real 2' }),
      entry({ id: 'monkey', display_name: 'Monkey', is_monkey: true }),
      entry({ id: 'real-3', display_name: 'Real 3' }),
      entry({ id: 'real-4', display_name: 'Real 4' }),
      entry({ id: 'real-5', display_name: 'Real 5' }),
      entry({ id: 'real-6', display_name: 'Real 6' }),
      entry({ id: CODEX_ID, display_name: 'Codex' }),
      entry({ id: 'real-7', display_name: 'Real 7' }),
      entry({ id: 'mid', display_name: 'Always Mid', automation_strategy: 'mid' }),
      entry({ id: 'real-8', display_name: 'Real 8' }),
      entry({ id: 'min', display_name: 'Always Min', automation_strategy: 'min' }),
    ]

    const { prizeByEntryId, fineByEntryId } = computePotAssignments(standings)

    expect(prizeByEntryId.get('real-1')).toBe(3400)
    expect(prizeByEntryId.get('real-2')).toBe(2380)
    expect(prizeByEntryId.get('real-3')).toBe(1020)
    expect(prizeByEntryId.get('real-4')).toBe(200)
    expect(prizeByEntryId.get('real-5')).toBe(100)
    expect(prizeByEntryId.has(CLAUDE_ID)).toBe(false)

    // Codex sits above Real 7 and the markers sit below, but the fines land on
    // the bottom two *real* players.
    expect(fineByEntryId.get('real-8')).toBe(200)
    expect(fineByEntryId.get('real-7')).toBe(100)
    expect(fineByEntryId.has(CODEX_ID)).toBe(false)
    expect(fineByEntryId.has('min')).toBe(false)
  })

  it('assigns only as many prizes as there are eligible players', () => {
    const { prizeByEntryId } = computePotAssignments(realUsers(3))

    expect(prizeByEntryId.get('real-1')).toBe(3400)
    expect(prizeByEntryId.get('real-2')).toBe(2380)
    expect(prizeByEntryId.get('real-3')).toBe(1020)
    expect(prizeByEntryId.size).toBe(3)
  })

  it('assigns no fines when fewer than two eligible players exist', () => {
    const single = computePotAssignments(realUsers(1))
    expect(single.fineByEntryId.size).toBe(0)

    const onlyBots = computePotAssignments([
      entry({ id: 'max', display_name: 'Always Max', automation_strategy: 'max' }),
      entry({ id: CLAUDE_ID, display_name: 'Claude' }),
    ])
    expect(onlyBots.prizeByEntryId.size).toBe(0)
    expect(onlyBots.fineByEntryId.size).toBe(0)
  })

  it('lets a player hold both a prize and a fine when the pool is smaller than seven', () => {
    const { prizeByEntryId, fineByEntryId } = computePotAssignments(realUsers(5))

    expect(prizeByEntryId.get('real-5')).toBe(100)
    expect(fineByEntryId.get('real-5')).toBe(200)
    expect(prizeByEntryId.get('real-4')).toBe(200)
    expect(fineByEntryId.get('real-4')).toBe(100)
  })

  it('exposes the prize ladder used by the pot', () => {
    expect([...PRIZES]).toEqual([3400, 2380, 1020, 200, 100])
  })
})
