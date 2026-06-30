-- Automated results sync: audit trail for externally-fetched match results.
--
-- The results sync job (Vercel cron + admin "Sync now" button) reads finished
-- World Cup matches from football-data.org, maps them to internal matches it
-- can confidently identify, and scores them directly through the existing
-- enter_match_day_results RPC — no admin approval step. One row is written per
-- auto-scored match (status 'applied') as an audit trail so an admin can see
-- why a result was entered. This table is decoupled from the scoring
-- transaction; it is informational only.
--
-- Trust model: only service_role writes here (the sync runner uses
-- createAdminClient()). Admins may read suggestions; regular players cannot.

create table if not exists public.match_result_suggestions (
  match_id          uuid primary key
                    references public.matches (id) on delete cascade,
  -- Computed 1 / X / 2 from the external 90-minute score. For knockout games
  -- decided in extra time or on penalties this remains the regulation result.
  suggested_result  text not null check (suggested_result in ('1', 'X', '2')),
  home_score        integer,
  away_score        integer,
  -- Raw context from the provider so the admin can sanity-check the mapping.
  source            text not null default 'football-data.org',
  external_match_id bigint,
  raw_winner        text,          -- HOME_TEAM | AWAY_TEAM | DRAW
  duration          text,          -- REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
  -- pending  : awaiting admin action
  -- applied  : admin scored the match while this suggestion was present
  -- dismissed: admin explicitly ignored it
  status            text not null default 'pending'
                    check (status in ('pending', 'applied', 'dismissed')),
  fetched_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists match_result_suggestions_status_idx
  on public.match_result_suggestions (status);

-- Keep updated_at fresh on re-sync upserts.
create or replace function public.touch_match_result_suggestions()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_match_result_suggestions
  on public.match_result_suggestions;
create trigger trg_touch_match_result_suggestions
  before update on public.match_result_suggestions
  for each row execute function public.touch_match_result_suggestions();

alter table public.match_result_suggestions enable row level security;

-- Admins may read suggestions. No insert/update/delete policies are defined,
-- so only service_role (which bypasses RLS) can write — exactly the sync
-- runner's createAdminClient() path.
drop policy if exists "match_result_suggestions_read_admin"
  on public.match_result_suggestions;
create policy "match_result_suggestions_read_admin"
  on public.match_result_suggestions
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.is_admin
    )
  );
