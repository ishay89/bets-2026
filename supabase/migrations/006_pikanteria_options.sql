-- 005_pikanteria_options.sql
-- Generalise Pikanteria from yes/no to N custom options.
-- Safe to run: no live pikanteria data exists yet.

-- 1. New child table for options
create table public.pikanteria_options (
  id            uuid primary key default gen_random_uuid(),
  pikanteria_id uuid not null references public.pikanteria(id) on delete cascade,
  label         text not null,
  odds          numeric(5,2) not null,
  is_correct    boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.pikanteria_options enable row level security;

create policy "pikanteria_options_read"
  on public.pikanteria_options for select
  using (true);

-- 2. Update pikanteria_answers: swap answer boolean for option_id
alter table public.pikanteria_answers
  drop column answer;

alter table public.pikanteria_answers
  add column option_id uuid not null references public.pikanteria_options(id) on delete cascade;

-- 3. Strip obsolete columns from pikanteria
alter table public.pikanteria
  drop column odds_yes,
  drop column odds_no,
  drop column result;
