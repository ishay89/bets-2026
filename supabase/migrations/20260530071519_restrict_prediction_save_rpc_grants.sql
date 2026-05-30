-- Restrict prediction save RPC execution to authenticated users.
-- Supabase projects may have default privileges that grant EXECUTE directly to
-- anon/authenticated/service_role on new public functions; revoking PUBLIC alone
-- is not sufficient in that case.

revoke execute on function public.save_match_prediction(uuid, text) from anon;
revoke execute on function public.save_pikanteria_answer(uuid, uuid) from anon;

grant execute on function public.save_match_prediction(uuid, text) to authenticated;
grant execute on function public.save_pikanteria_answer(uuid, uuid) to authenticated;
