import { describe, expect, it } from 'vitest'
import {
  AI_USERS,
  aiUserById,
  aiUserBySlug,
  isValidPikanteriaPick,
  usersMissingFutures,
} from './ai-picks'

describe('AI_USERS', () => {
  it('exposes Claude and Codex with their stable IDs', () => {
    expect(AI_USERS).toEqual([
      { id: '00000000-0000-0000-0000-000000000006', name: 'Claude', slug: 'claude' },
      { id: '00000000-0000-0000-0000-000000000005', name: 'Codex', slug: 'codex' },
    ])
  })
})

describe('aiUserBySlug', () => {
  it('resolves codex by slug', () => {
    expect(aiUserBySlug('codex').name).toBe('Codex')
  })

  it('defaults to Claude for undefined or unknown slugs', () => {
    expect(aiUserBySlug(undefined).name).toBe('Claude')
    expect(aiUserBySlug('monkey').name).toBe('Claude')
  })
})

describe('aiUserById', () => {
  it('resolves both AI users by id', () => {
    expect(aiUserById('00000000-0000-0000-0000-000000000005')?.name).toBe('Codex')
    expect(aiUserById('00000000-0000-0000-0000-000000000006')?.name).toBe('Claude')
  })

  it('returns undefined for any other user id', () => {
    // Monkey's id — a real user, but not one of the seeded AI dummy accounts.
    expect(aiUserById('00000000-0000-0000-0000-000000000001')).toBeUndefined()
    expect(aiUserById('not-a-uuid')).toBeUndefined()
  })
})

describe('isValidPikanteriaPick', () => {
  it('accepts 1 and 2 regardless of question shape', () => {
    expect(isValidPikanteriaPick('1', null)).toBe(true)
    expect(isValidPikanteriaPick('2', null)).toBe(true)
    expect(isValidPikanteriaPick('1', 3.5)).toBe(true)
  })

  it('accepts X only on three-way questions', () => {
    expect(isValidPikanteriaPick('X', 3.5)).toBe(true)
    expect(isValidPikanteriaPick('X', null)).toBe(false)
  })
})

describe('usersMissingFutures', () => {
  const bots = [
    { id: 'bot-a' },
    { id: 'bot-b' },
    { id: 'bot-c' },
  ]

  it('keeps only users without an existing futures pick', () => {
    expect(usersMissingFutures(bots, new Set(['bot-b']))).toEqual([
      { id: 'bot-a' },
      { id: 'bot-c' },
    ])
  })

  it('returns everyone when no picks exist and no one when all exist', () => {
    expect(usersMissingFutures(bots, new Set())).toEqual(bots)
    expect(usersMissingFutures(bots, new Set(['bot-a', 'bot-b', 'bot-c']))).toEqual([])
  })
})
