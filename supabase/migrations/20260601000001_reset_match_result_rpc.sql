-- Atomic reset of a single match result.
-- Mirrors the write discipline of enter_match_day_results: all tables
-- cleared in one Postgres transaction so the DB cannot end up half-reset
-- (match nulled but prediction points still populated).
create or replace function public.reset_match_result(
  p_match_id     uuid,
  p_match_day_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Clear the match result (guard with match_day_id to prevent cross-day resets).
  update public.matches
  set result = null
  where id = p_match_id
    and match_day_id = p_match_day_id;

  -- Clear prediction points for every prediction on this match.
  update public.predictions
  set points = null
  where match_id = p_match_id;

  -- Post-reset invariant: no prediction on this match may still carry points.
  if exists (
    select 1 from public.predictions
    where match_id = p_match_id and points is not null
  ) then
    raise exception
      'reset_match_result: predictions for match % still have points after reset',
      p_match_id;
  end if;
end;
$$;

revoke all on function public.reset_match_result(uuid, uuid) from public;
grant execute on function public.reset_match_result(uuid, uuid) to service_role;
