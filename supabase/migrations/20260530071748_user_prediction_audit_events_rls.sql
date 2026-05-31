-- Allow authenticated users to write their own audit trail rows.
-- The table already has RLS enabled; without this policy, prediction updates
-- can save successfully and then fail when the audit insert runs.

drop policy if exists "user_prediction_audit_events_insert_own"
  on public.user_prediction_audit_events;

create policy "user_prediction_audit_events_insert_own"
  on public.user_prediction_audit_events
  for insert
  with check (auth.uid() = user_id);
