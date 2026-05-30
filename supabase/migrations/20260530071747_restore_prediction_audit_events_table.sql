-- Restore the prediction audit table if migration history says it ran but the
-- object is missing. Prediction save RPCs write to this table transactionally.

create table if not exists public.user_prediction_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null check (event_type in ('match_prediction', 'pikanteria_answer', 'pre_tournament_pick')),
  action text not null check (action in ('create', 'update')),
  entity_id uuid,
  entity_ref text not null,
  old_value jsonb,
  new_value jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  committed_at timestamptz not null default now()
);

alter table public.user_prediction_audit_events enable row level security;

grant select, insert on public.user_prediction_audit_events to authenticated;

drop policy if exists "user_prediction_audit_events_insert_own"
  on public.user_prediction_audit_events;

create policy "user_prediction_audit_events_insert_own"
  on public.user_prediction_audit_events
  for insert
  with check (auth.uid() = user_id);

create index if not exists user_prediction_audit_events_committed_at_idx
  on public.user_prediction_audit_events (committed_at desc);

create index if not exists user_prediction_audit_events_user_id_committed_at_idx
  on public.user_prediction_audit_events (user_id, committed_at desc);

create index if not exists user_prediction_audit_events_event_type_committed_at_idx
  on public.user_prediction_audit_events (event_type, committed_at desc);
