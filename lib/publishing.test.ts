import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setPikanteriaPublishedAt } from './publishing'

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
