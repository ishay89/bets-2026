import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setPikanteriaPublishedAt, setUnscoredMatchLocksForDay } from './publishing'

function pikanteriaUpdateClient(
  updateResult: { data: unknown; error: { message: string } | null },
  syncResult: { error: { message: string } | null } = { error: null },
) {
  const single = vi.fn(async () => updateResult)
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  const rpc = vi.fn(async () => syncResult)

  return { client: { from, rpc }, from, update, eq, select, single, rpc }
}

function matchLockClient(result: { error: { message: string } | null } = { error: null }) {
  const rpc = vi.fn(async () => result)

  return { client: { rpc }, rpc }
}

describe('pikanteria publishing', () => {
  test('syncs the parent match day after publishing a pikanteria item', async () => {
    const publishedAt = '2026-06-04T20:00:00.000Z'
    const mocks = pikanteriaUpdateClient({
      data: { match_day_id: 'day-1' },
      error: null,
    })

    await expect(
      setPikanteriaPublishedAt(mocks.client, 'pika-1', publishedAt),
    ).resolves.toEqual({ matchDayId: 'day-1' })

    expect(mocks.from).toHaveBeenCalledWith('pikanteria')
    expect(mocks.update).toHaveBeenCalledWith({ published_at: publishedAt })
    expect(mocks.eq).toHaveBeenCalledWith('id', 'pika-1')
    expect(mocks.select).toHaveBeenCalledWith('match_day_id')
    expect(mocks.rpc).toHaveBeenCalledWith('recompute_match_day_publish', {
      p_match_day_id: 'day-1',
    })
  })

  test('does not pretend a pikanteria publish worked when Supabase rejects the update', async () => {
    const mocks = pikanteriaUpdateClient({
      data: null,
      error: { message: 'trigger failed' },
    })

    await expect(
      setPikanteriaPublishedAt(mocks.client, 'pika-1', '2026-06-04T20:00:00.000Z'),
    ).rejects.toThrow('Failed to update pikanteria publication: trigger failed')

    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('pikanteria publish visibility migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260604193000_resync_pikanteria_publish_days.sql'),
    'utf8',
  )

  test('repairs parent-day visibility for published pikanteria rows', () => {
    expect(sql).toContain('create or replace function public.recompute_match_day_publish')
    expect(sql).toContain('grant execute on function public.recompute_match_day_publish(uuid) to service_role')
    expect(sql).toContain('create trigger pikanteria_publish_sync')
    expect(sql).toContain('perform public.recompute_match_day_publish(v_match_day_id)')
  })
})

describe('pikanteria canonical match day migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260613120000_canonical_pikanteria_match_day.sql'),
    'utf8',
  )

  test('inserts pikanteria into the match day used by matches for that date', () => {
    expect(sql).toContain('create or replace function public.insert_pikanteria')
    expect(sql).toContain('select md.date into v_requested_date')
    expect(sql).toContain('select m.match_day_id into v_canonical_match_day_id')
    expect(sql).toContain('join public.match_days md on md.id = m.match_day_id')
    expect(sql).toContain('md.date = v_requested_date')
    expect(sql).toContain('values (v_canonical_match_day_id')
  })
})

describe('bulk match day locks', () => {
  test('locks the day matches and pikanteria through the bulk RPC', async () => {
    const mocks = matchLockClient()

    await setUnscoredMatchLocksForDay(mocks.client, 'day-1', true)

    expect(mocks.rpc).toHaveBeenCalledWith('set_unscored_match_locks_for_day', {
      p_match_day_id: 'day-1',
      p_locked: true,
    })
  })

  test('surfaces a Supabase error from the bulk RPC', async () => {
    const mocks = matchLockClient({ error: { message: 'denied' } })

    await expect(setUnscoredMatchLocksForDay(mocks.client, 'day-1', false)).rejects.toThrow(
      'Failed to update match locks: denied',
    )
  })
})

describe('admin match unlock override migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260614200000_admin_match_unlock_override.sql'),
    'utf8',
  )

  test('adds the unlock_override column to matches', () => {
    expect(sql).toContain('add column if not exists unlock_override boolean not null default false')
  })

  test('keeps the deadline sweep from re-locking overridden matches', () => {
    expect(sql).toMatch(/where locked = false[\s\S]+and unlock_override = false/)
  })

  test('lets the save RPC keep an overridden match open', () => {
    expect(sql).toContain(
      "(v_now >= v_match.kickoff_time - interval '5 minutes' and not v_match.unlock_override)",
    )
  })

  test('bulk RPC also locks the day pikanteria', () => {
    expect(sql).toContain('create or replace function public.set_unscored_match_locks_for_day')
    expect(sql).toMatch(/update public\.pikanteria[\s\S]+set locked = p_locked/)
  })
})
