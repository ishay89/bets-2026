import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const hardeningSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260610051453_harden_public_rls_and_rpc_grants.sql'),
  'utf8',
)

const invokerSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260610051706_make_player_rpcs_security_invoker.sql'),
  'utf8',
)

const anonRevokeSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260610051856_revoke_anon_public_table_access.sql'),
  'utf8',
)

const approvedRlsSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260610052133_enforce_approved_user_rls.sql'),
  'utf8',
)

const approvedStorageSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260610052329_enforce_approved_storage_policies.sql'),
  'utf8',
)

const sql = `${hardeningSql}\n${invokerSql}\n${anonRevokeSql}\n${approvedRlsSql}\n${approvedStorageSql}`

describe('public security hardening migration', () => {
  it('enables RLS for tournament settings with read-only authenticated access', () => {
    expect(sql).toContain('alter table public.tournament_settings enable row level security')
    expect(sql).toContain('create policy "tournament_settings_read_authenticated"')
    expect(sql).toContain('for select')
    expect(sql).toContain('to authenticated')
  })

  it('uses caller RLS for the leaderboard view', () => {
    expect(sql).toContain('alter view public.leaderboard set (security_invoker = true)')
    expect(sql).toContain('revoke select on public.leaderboard from anon')
    expect(sql).toContain('grant select on public.leaderboard to authenticated')
  })

  it('revokes public RPC execution and grants only the app-required roles', () => {
    expect(sql).toContain('alter default privileges in schema public')
    expect(sql).toContain('revoke execute on all functions in schema public from public')
    expect(sql).toContain('revoke execute on all functions in schema public from anon')
    expect(sql).toContain('revoke execute on all functions in schema public from authenticated')
    expect(sql).toContain('alter function public.save_match_prediction(uuid, text) security invoker')
    expect(sql).toContain('alter function public.save_pikanteria_answer(uuid, text) security invoker')
    expect(sql).toContain('alter function public.crowd_match_picks() security invoker')
    expect(sql).toContain('alter function public.crowd_pikanteria_picks() security invoker')
    expect(sql).toContain('grant execute on function public.save_match_prediction(uuid, text) to authenticated')
    expect(sql).toContain('grant execute on function public.save_pikanteria_answer(uuid, text) to authenticated')
    expect(sql).toContain('grant execute on function public.crowd_match_picks() to authenticated')
    expect(sql).toContain('grant execute on function public.crowd_pikanteria_picks() to authenticated')
    expect(sql).toContain('grant execute on all functions in schema public to service_role')
  })

  it('removes anonymous public schema table access', () => {
    expect(sql).toContain('revoke all privileges on all tables in schema public from anon')
    expect(sql).toContain('revoke all privileges on all sequences in schema public from anon')
    expect(sql).toContain('revoke all privileges on tables from anon')
    expect(sql).toContain('revoke all privileges on sequences from anon')
  })

  it('gates game data RLS behind approved authenticated users', () => {
    expect(sql).toContain('create schema if not exists private')
    expect(sql).toContain('create or replace function private.is_approved_user()')
    expect(sql).toContain("and u.status = 'approved'")
    expect(sql).toContain('create policy "users_read_own_or_approved"')
    expect(sql).toContain('using (published_at is not null and private.is_approved_user())')
    expect(sql).toContain('with check (private.is_approved_user() and auth.uid() = user_id)')
    expect(sql).toContain('using (private.is_approved_user())')
  })

  it('requires approved users for message board image storage writes', () => {
    expect(sql).toContain('drop policy if exists "message_board_images_insert_own" on storage.objects')
    expect(sql).toContain("bucket_id = 'message-board-images'")
    expect(sql).toContain('and private.is_approved_user()')
    expect(sql).toContain('drop policy if exists "message_board_images_delete_own_or_admin" on storage.objects')
  })
})
