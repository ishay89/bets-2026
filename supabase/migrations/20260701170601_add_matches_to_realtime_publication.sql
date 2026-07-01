-- Mondial Bets 2026 - Broadcast live-score changes for the predict page.
--
-- components/predict-live-refresh.tsx subscribes to postgres_changes UPDATE on
-- the matches table to auto-refresh the live score during a match, but matches
-- was never added to the supabase_realtime publication (only the score tables
-- were, in 20260612050100_realtime_score_tables.sql). The subscription therefore
-- never fired, so an open /predict page stayed frozen at whatever score it
-- showed on load — live scores only appeared on a manual reload, and with
-- several viewers the 20s poll fallback mostly returned changed:false because
-- another client had already refreshed live_synced_at. Events remain
-- RLS-filtered per subscriber, exactly like direct reads.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    execute 'alter publication supabase_realtime add table public.matches';
  end if;
end;
$$;
