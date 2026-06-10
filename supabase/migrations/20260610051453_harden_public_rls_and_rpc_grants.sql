-- Harden the public API surface flagged by Supabase security advisors.
-- Public-schema tables must have RLS enabled, and SECURITY DEFINER functions
-- should only be executable by the roles that actually need them.

alter table public.tournament_settings enable row level security;

drop policy if exists "tournament_settings_read_authenticated"
  on public.tournament_settings;

create policy "tournament_settings_read_authenticated"
  on public.tournament_settings
  for select
  to authenticated
  using (true);

-- The leaderboard is intentionally readable by signed-in users, but it should
-- evaluate the underlying tables with the caller's RLS policies.
alter view public.leaderboard set (security_invoker = true);
revoke select on public.leaderboard from anon;
grant select on public.leaderboard to authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Revoke that
-- default for future functions created by the migration owner, and clean up the
-- existing public RPC surface.
alter default privileges in schema public
  revoke execute on functions from public;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

-- Player-facing RPCs used through the authenticated Supabase client.
grant execute on function public.save_match_prediction(uuid, text) to authenticated;
grant execute on function public.save_pikanteria_answer(uuid, text) to authenticated;
grant execute on function public.crowd_match_picks() to authenticated;
grant execute on function public.crowd_pikanteria_picks() to authenticated;

-- Server-only/admin RPCs use the service role client.
grant execute on all functions in schema public to service_role;
