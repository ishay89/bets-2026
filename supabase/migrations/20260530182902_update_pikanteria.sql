-- Mondial Bets 2026 — Edit a pikanteria question and its options atomically.
--
-- Lets the admin edit a published (or draft) pikanteria from /admin/edit: update
-- the question text, edit existing options' label/odds, and add new options. An
-- option that already has player answers cannot be removed (the answers reference
-- it), so removal is not supported here; is_correct is owned by the scoring path
-- and is left untouched.
--
--   p_options: [{"id": uuid|null, "label": text, "odds": numeric, "sort_order": int}]
--     - rows with a non-null id update that existing option
--     - rows with a null id insert a new option
create or replace function public.update_pikanteria_with_options(
  p_pikanteria_id uuid,
  p_question      text,
  p_options       jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kept_ids uuid[];
  v_orphan_count int;
begin
  if jsonb_array_length(p_options) < 2 then
    raise exception 'A pikanteria question requires at least 2 options';
  end if;

  if not exists (select 1 from public.pikanteria where id = p_pikanteria_id) then
    raise exception 'Pikanteria % not found', p_pikanteria_id;
  end if;

  update public.pikanteria
  set question = p_question
  where id = p_pikanteria_id;

  -- Ids the caller intends to keep (existing options referenced by the payload).
  select coalesce(array_agg((o.id)::uuid) filter (where o.id is not null), '{}')
  into v_kept_ids
  from jsonb_to_recordset(p_options) as o(id uuid, label text, odds numeric, sort_order int);

  -- Refuse to drop an option that has answers — that would orphan player picks.
  select count(*)
  into v_orphan_count
  from public.pikanteria_options po
  where po.pikanteria_id = p_pikanteria_id
    and not (po.id = any (v_kept_ids))
    and exists (
      select 1 from public.pikanteria_answers a where a.option_id = po.id
    );
  if v_orphan_count > 0 then
    raise exception
      'Cannot remove a pikanteria option that already has answers (% affected)', v_orphan_count;
  end if;

  -- Delete options the caller dropped that have no answers.
  delete from public.pikanteria_options po
  where po.pikanteria_id = p_pikanteria_id
    and not (po.id = any (v_kept_ids));

  -- Update existing options.
  update public.pikanteria_options po
  set label = o.label,
      odds = o.odds,
      sort_order = o.sort_order
  from jsonb_to_recordset(p_options) as o(id uuid, label text, odds numeric, sort_order int)
  where o.id is not null
    and po.id = o.id
    and po.pikanteria_id = p_pikanteria_id;

  -- Insert new options.
  insert into public.pikanteria_options (pikanteria_id, label, odds, sort_order)
  select p_pikanteria_id, o.label, o.odds, o.sort_order
  from jsonb_to_recordset(p_options) as o(id uuid, label text, odds numeric, sort_order int)
  where o.id is null;
end;
$$;

revoke all on function public.update_pikanteria_with_options(uuid, text, jsonb) from public;
grant execute on function public.update_pikanteria_with_options(uuid, text, jsonb) to service_role;
