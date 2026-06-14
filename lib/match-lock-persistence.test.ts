import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { persistDueMatchLocks } from './match-lock-persistence'

function rpcClient(result: { data: unknown; error: { message: string } | null }) {
  return {
    rpc: vi.fn(async () => result),
  }
}

describe('persistDueMatchLocks', () => {
  test('persists due match locks through the service-role RPC', async () => {
    const client = rpcClient({ data: 2, error: null })

    await expect(persistDueMatchLocks(client)).resolves.toBe(2)

    expect(client.rpc).toHaveBeenCalledWith('persist_due_match_locks')
  })

  test('throws when the RPC fails so callers do not silently read stale lock state', async () => {
    const client = rpcClient({ data: null, error: { message: 'permission denied' } })

    await expect(persistDueMatchLocks(client)).rejects.toThrow(
      'Failed to persist due match locks: permission denied',
    )
  })
})

describe('due match lock persistence migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260614011427_persist_due_match_locks.sql'),
    'utf8',
  )

  test('creates an idempotent RPC that locks unscored matches using database time', () => {
    expect(sql).toContain('create or replace function public.persist_due_match_locks()')
    expect(sql).toMatch(/update public\.matches[\s\S]+set locked = true/)
    expect(sql).toMatch(/where locked = false[\s\S]+and result is null/)
    expect(sql).toMatch(/now\(\) >= kickoff_time - interval '5 minutes'/)
    expect(sql).toContain('returning id')
  })

  test('keeps the mutating RPC service-role only', () => {
    expect(sql).toContain('revoke all on function public.persist_due_match_locks() from public')
    expect(sql).toContain('revoke all on function public.persist_due_match_locks() from anon')
    expect(sql).toContain('revoke all on function public.persist_due_match_locks() from authenticated')
    expect(sql).toContain('grant execute on function public.persist_due_match_locks() to service_role')
  })
})
