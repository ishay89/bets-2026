import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260610060000_admin_users_read_bypass.sql'),
  'utf8',
)

describe('admin users RLS read bypass migration', () => {
  it('adds a security-definer admin check usable inside RLS policies', () => {
    expect(sql).toContain('create or replace function private.is_admin_user()')
    expect(sql).toContain('security definer')
    expect(sql).toContain('and u.is_admin')
    expect(sql).toContain('grant execute on function private.is_admin_user() to authenticated, service_role')
  })

  it('lets admins read every user profile regardless of status', () => {
    expect(sql).toContain('drop policy if exists "users_read_own_or_approved" on public.users')
    expect(sql).toContain('create policy "users_read_own_or_approved"')
    expect(sql).toContain('or private.is_admin_user()')
  })
})
