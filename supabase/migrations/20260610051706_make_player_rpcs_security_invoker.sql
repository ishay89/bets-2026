-- The authenticated player RPCs are intended to be callable by signed-in users,
-- but they do not need SECURITY DEFINER privileges. Run them as the caller so
-- table permissions and RLS remain part of the enforcement path.

alter function public.save_match_prediction(uuid, text) security invoker;
alter function public.save_pikanteria_answer(uuid, text) security invoker;
alter function public.crowd_match_picks() security invoker;
alter function public.crowd_pikanteria_picks() security invoker;

grant execute on function public.save_match_prediction(uuid, text) to authenticated;
grant execute on function public.save_pikanteria_answer(uuid, text) to authenticated;
grant execute on function public.crowd_match_picks() to authenticated;
grant execute on function public.crowd_pikanteria_picks() to authenticated;
grant execute on all functions in schema public to service_role;
