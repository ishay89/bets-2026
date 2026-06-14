create or replace function public.persist_due_match_locks()
returns integer
language sql
security invoker
set search_path = public
as $$
  with locked_matches as (
    update public.matches
    set locked = true
    where locked = false
      and result is null
      and now() >= kickoff_time - interval '5 minutes'
    returning id
  )
  select count(*)::integer from locked_matches;
$$;

revoke all on function public.persist_due_match_locks() from public;
revoke all on function public.persist_due_match_locks() from anon;
revoke all on function public.persist_due_match_locks() from authenticated;
grant execute on function public.persist_due_match_locks() to service_role;
