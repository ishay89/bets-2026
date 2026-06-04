-- Ensure pikanteria publication always makes its parent day visible.
--
-- The player /predict query starts from match_days where published_at is set.
-- Recreate the per-item sync trigger/function and backfill every day so any
-- already-published pikanteria rows repair their parent match_days row.

create or replace function public.recompute_match_day_publish(p_match_day_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_published boolean;
  v_lock timestamptz;
  v_current_published timestamptz;
begin
  select
    exists (select 1 from public.matches where match_day_id = p_match_day_id and published_at is not null)
    or exists (select 1 from public.pikanteria where match_day_id = p_match_day_id and published_at is not null)
  into v_has_published;

  select min(kickoff_time) - interval '5 minutes' into v_lock
  from public.matches
  where match_day_id = p_match_day_id
    and published_at is not null;

  if v_lock is null then
    select min(kickoff_time) - interval '5 minutes' into v_lock
    from public.matches
    where match_day_id = p_match_day_id;
  end if;

  select published_at into v_current_published
  from public.match_days
  where id = p_match_day_id;

  update public.match_days
  set published_at = case
        when v_has_published then coalesce(v_current_published, now())
        else null
      end,
      lock_time = coalesce(v_lock, lock_time)
  where id = p_match_day_id;
end;
$$;

revoke all on function public.recompute_match_day_publish(uuid) from public;
grant execute on function public.recompute_match_day_publish(uuid) to service_role;

create or replace function public.trg_matches_publish_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_match_day_publish(old.match_day_id);
    return old;
  end if;

  perform public.recompute_match_day_publish(new.match_day_id);
  return new;
end;
$$;

create or replace function public.trg_pikanteria_publish_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_match_day_publish(old.match_day_id);
    return old;
  end if;

  perform public.recompute_match_day_publish(new.match_day_id);
  return new;
end;
$$;

drop trigger if exists matches_publish_sync on public.matches;
create trigger matches_publish_sync
  after insert or update of published_at, kickoff_time or delete on public.matches
  for each row execute function public.trg_matches_publish_sync();

drop trigger if exists pikanteria_publish_sync on public.pikanteria;
create trigger pikanteria_publish_sync
  after insert or update of published_at or delete on public.pikanteria
  for each row execute function public.trg_pikanteria_publish_sync();

do $$
declare
  v_match_day_id uuid;
begin
  for v_match_day_id in select id from public.match_days loop
    perform public.recompute_match_day_publish(v_match_day_id);
  end loop;
end;
$$;
