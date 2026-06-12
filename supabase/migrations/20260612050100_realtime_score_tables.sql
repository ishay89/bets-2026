-- Mondial Bets 2026 - Broadcast score changes for the live leaderboard.
--
-- components/leaderboard-realtime.tsx subscribes to postgres_changes on
-- predictions, pikanteria_answers, and pre_tournament_picks, but these tables
-- were never added to the supabase_realtime publication, so the refresh
-- callback never fired and the "live" leaderboard was static until a reload.
-- Events remain RLS-filtered per subscriber, exactly like direct reads.

do $$
declare
  t text;
begin
  foreach t in array array['predictions', 'pikanteria_answers', 'pre_tournament_picks'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
