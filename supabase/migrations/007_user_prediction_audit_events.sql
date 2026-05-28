create table public.user_prediction_audit_events (
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

create index user_prediction_audit_events_committed_at_idx
  on public.user_prediction_audit_events (committed_at desc);

create index user_prediction_audit_events_user_id_committed_at_idx
  on public.user_prediction_audit_events (user_id, committed_at desc);

create index user_prediction_audit_events_event_type_committed_at_idx
  on public.user_prediction_audit_events (event_type, committed_at desc);
