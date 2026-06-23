import { describe, expect, it } from 'vitest'
import {
  filterAdminPickDays,
  selectAdminPickTargetUser,
} from './admin-picks'

const approvedUser = {
  id: 'user-1',
  display_name: 'Ada',
  email: 'ada@example.com',
  status: 'approved' as const,
  is_monkey: false,
}

describe('selectAdminPickTargetUser', () => {
  it('allows any approved non-benchmark user to be selected', () => {
    const users = [
      approvedUser,
      {
        id: 'user-2',
        display_name: 'Ben',
        email: 'ben@example.com',
        status: 'approved' as const,
        is_monkey: false,
      },
    ]

    expect(selectAdminPickTargetUser(users, 'user-2')?.display_name).toBe('Ben')
  })

  it('falls back to the first approved non-benchmark user for missing or invalid ids', () => {
    const users = [
      {
        id: 'pending',
        display_name: 'Pending',
        email: 'pending@example.com',
        status: 'pending' as const,
        is_monkey: false,
      },
      approvedUser,
      {
        id: 'marker',
        display_name: 'Always Max',
        email: null,
        status: 'approved' as const,
        is_monkey: true,
      },
    ]

    expect(selectAdminPickTargetUser(users, undefined)?.id).toBe('user-1')
    expect(selectAdminPickTargetUser(users, 'pending')?.id).toBe('user-1')
    expect(selectAdminPickTargetUser(users, 'marker')?.id).toBe('user-1')
  })
})

describe('filterAdminPickDays', () => {
  const day = {
    id: 'day-1',
    date: '2026-06-15',
    stage: 'group',
    published_at: '2026-06-14T10:00:00Z',
  }

  it('includes locked published unscored matches and pikanteria', () => {
    const result = filterAdminPickDays([
      {
        ...day,
        matches: [
          {
            id: 'locked-match',
            published_at: '2026-06-14T10:00:00Z',
            result: null,
            locked: true,
            kickoff_time: '2026-06-15T19:00:00Z',
          },
        ],
        pikanteria: [
          {
            id: 'locked-pika',
            published_at: '2026-06-14T10:00:00Z',
            result: null,
            locked: true,
            kickoff_time: '2026-06-15T19:00:00Z',
          },
        ],
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].openMatches.map(item => item.id)).toEqual(['locked-match'])
    expect(result[0].openPikanteria.map(item => item.id)).toEqual(['locked-pika'])
  })

  it('excludes draft and already-scored items', () => {
    const result = filterAdminPickDays([
      {
        ...day,
        matches: [
          {
            id: 'draft-match',
            published_at: null,
            result: null,
            locked: false,
            kickoff_time: '2026-06-15T18:00:00Z',
          },
          {
            id: 'scored-match',
            published_at: '2026-06-14T10:00:00Z',
            result: '1',
            locked: true,
            kickoff_time: '2026-06-15T19:00:00Z',
          },
        ],
        pikanteria: [
          {
            id: 'draft-pika',
            published_at: null,
            result: null,
            locked: false,
            kickoff_time: '2026-06-15T18:00:00Z',
          },
          {
            id: 'scored-pika',
            published_at: '2026-06-14T10:00:00Z',
            result: '2',
            locked: true,
            kickoff_time: '2026-06-15T19:00:00Z',
          },
        ],
      },
    ])

    expect(result).toEqual([])
  })
})
