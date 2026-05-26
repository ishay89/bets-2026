-- Mondial Bets 2026 — Row Level Security Policies
-- Run this second in the Supabase SQL Editor (Dashboard → SQL Editor),
-- after 001_schema.sql has been applied successfully.

alter table public.users enable row level security;
alter table public.match_days enable row level security;
alter table public.matches enable row level security;
alter table public.pikanteria enable row level security;
alter table public.predictions enable row level security;
alter table public.pikanteria_answers enable row level security;
alter table public.pre_tournament_picks enable row level security;

-- Users: anyone can read, only own row to write
create policy "users_read_all" on public.users for select using (true);
create policy "users_insert_own" on public.users for insert with check (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id);

-- Match days + matches + pikanteria: published ones readable by all
create policy "match_days_read" on public.match_days for select
  using (published_at is not null);
create policy "matches_read" on public.matches for select using (true);
create policy "pikanteria_read" on public.pikanteria for select using (true);

-- Predictions: read all, write own (enforced in app: only before lock)
create policy "predictions_read_all" on public.predictions for select using (true);
create policy "predictions_write_own" on public.predictions
  for insert with check (auth.uid() = user_id);
create policy "predictions_update_own" on public.predictions
  for update using (auth.uid() = user_id);

-- Pikanteria answers: same pattern
create policy "pik_answers_read_all" on public.pikanteria_answers for select using (true);
create policy "pik_answers_write_own" on public.pikanteria_answers
  for insert with check (auth.uid() = user_id);
create policy "pik_answers_update_own" on public.pikanteria_answers
  for update using (auth.uid() = user_id);

-- Pre-tournament picks: read all, write own
create policy "pretournament_read_all" on public.pre_tournament_picks for select using (true);
create policy "pretournament_write_own" on public.pre_tournament_picks
  for insert with check (auth.uid() = user_id);
create policy "pretournament_update_own" on public.pre_tournament_picks
  for update using (auth.uid() = user_id);

-- Leaderboard view: public
grant select on public.leaderboard to anon, authenticated;
