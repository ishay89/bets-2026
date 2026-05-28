-- Mondial Bets 2026 — Add r32 stage for World Cup 2026 Round of 32
-- FIFA World Cup 2026 introduces a new Round of 32 (48 teams → 32).
-- The original schema only had group/r16/qf/sf/3rd/final.

alter table public.match_days
  drop constraint match_days_stage_check;

alter table public.match_days
  add constraint match_days_stage_check
  check (stage in ('group', 'r32', 'r16', 'qf', 'sf', '3rd', 'final'));