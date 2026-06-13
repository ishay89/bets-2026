-- Mondial Bets 2026 - Put new pikanteria in the match day group used by matches.
--
-- Admins add pikanteria from a selected calendar day. If match rows were
-- regrouped to another match_days row for that same date, the insert RPC should
-- attach the question to the canonical match group instead of trusting a stale
-- submitted match_day_id.

create or replace function public.insert_pikanteria(
  p_match_day_id uuid,
  p_question     text,
  p_label_1      text,
  p_odds_1       numeric,
  p_label_2      text,
  p_odds_2       numeric,
  p_label_x      text,
  p_odds_x       numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_requested_date date;
  v_canonical_match_day_id uuid;
begin
  if (p_label_x is null) <> (p_odds_x is null) then
    raise exception 'The X outcome requires both a label and odds, or neither';
  end if;

  select md.date into v_requested_date
  from public.match_days md
  where md.id = p_match_day_id;

  if v_requested_date is null then
    raise exception 'Match day % not found', p_match_day_id;
  end if;

  select m.match_day_id into v_canonical_match_day_id
  from public.matches m
  join public.match_days md on md.id = m.match_day_id
  where md.date = v_requested_date
  order by m.kickoff_time, m.id
  limit 1;

  v_canonical_match_day_id := coalesce(v_canonical_match_day_id, p_match_day_id);

  insert into public.pikanteria (match_day_id, question, label_1, odds_1, label_2, odds_2, label_x, odds_x)
  values (v_canonical_match_day_id, p_question, p_label_1, p_odds_1, p_label_2, p_odds_2, p_label_x, p_odds_x)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric) from public;
grant execute on function public.insert_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric) to service_role;

-- Repair unscored pikanteria that may already sit on a stale day row for a
-- date whose matches now use a different match_day_id. Scored rows are left in
-- place to avoid moving historical points between score days.
update public.pikanteria pk
set match_day_id = canonical.match_day_id
from public.match_days pk_day
join lateral (
  select m.match_day_id
  from public.matches m
  join public.match_days md on md.id = m.match_day_id
  where md.date = pk_day.date
  order by m.kickoff_time, m.id
  limit 1
) canonical on true
where pk.match_day_id = pk_day.id
  and pk.result is null
  and pk.match_day_id is distinct from canonical.match_day_id;

do $$
declare
  day_id uuid;
begin
  for day_id in select id from public.match_days loop
    perform public.recompute_match_day_publish(day_id);
  end loop;
end;
$$;
