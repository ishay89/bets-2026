# User Prediction Audit Design

## Goal

Give admins a reliable history of user-submitted prediction commits without auditing admin or system maintenance actions.

## Scope

Audit these user actions:

- Match prediction creates and changes on `/predict`.
- Pikanteria answer creates and changes on `/predict`.
- Pre-tournament pick creates and changes on `/pre-tournament`.

Do not audit admin actions such as publishing match days, entering results, recalculating scores, or changing admin roles.

## Data Model

Add an append-only table named `public.user_prediction_audit_events`.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.users(id) on delete cascade`
- `event_type text not null check (...)`
- `action text not null check (action in ('create','update'))`
- `entity_id uuid`
- `entity_ref text not null`
- `old_value jsonb`
- `new_value jsonb not null`
- `metadata jsonb not null default '{}'::jsonb`
- `committed_at timestamptz not null default now()`

`event_type` values are `match_prediction`, `pikanteria_answer`, and `pre_tournament_pick`.

Enable RLS on the table. No user-facing policies are needed because users should not read or write audit rows directly. Server Actions will write through the service-role client after authenticating the current user. Admin pages will read through the existing admin guard plus service-role client pattern.

## Write Flow

Each user save action should:

1. Authenticate the current user with `supabase.auth.getUser()`.
2. Re-check the relevant lock server-side before writing.
3. Read the existing row for the user and target entity.
4. Upsert the current-state row.
5. Insert one audit event only if the row is new or the submitted value differs from the previous value.

Lock rules:

- Match and pikanteria changes are blocked once the related `match_days.lock_time` has passed.
- Pre-tournament changes are blocked once the first published match day lock time has passed.

Duplicate submissions of the same value should not create audit noise.

## Audit Values

Audit payloads should be useful without reconstructing everything from current mutable rows:

- Match prediction `old_value` and `new_value`: `{ "pick": "1" | "X" | "2" }`.
- Match metadata: match id, match day id, date, teams, kickoff, odds snapshot.
- Pikanteria answer values: selected `option_id`, label, and odds.
- Pikanteria metadata: question id, question text, match day id, date.
- Pre-tournament values: winner team/odds and top scorer/odds.

## Admin Experience

Add `/admin/audit` and link it from the admin home/header.

The page should show the newest events first and include:

- committed timestamp
- player display name
- event type
- create/update action
- old value to new value
- contextual label, such as `Argentina vs France`, pikanteria question text, or `Pre-tournament`

A simple read-only list/table is enough for the first version.

## Testing

Add unit tests around a small audit helper so behavior is verified without needing a live Supabase database:

- creates an event for a missing previous value
- creates an event for changed values
- skips event creation when submitted values are unchanged

Run the existing test suite and lint after implementation.
