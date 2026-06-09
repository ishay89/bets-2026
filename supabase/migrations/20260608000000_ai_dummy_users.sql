-- Add AI-controlled dummy users for manual/admin-managed predictions.
--
-- These are approved regular players, not automated marker users. They do not
-- receive publish-time generated picks; admins or service-role processes can
-- write their predictions/pikanteria answers directly using these stable IDs.

insert into auth.users (id, email, role, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000005', 'codex@mondial2026.local', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000006', 'claude@mondial2026.local', 'authenticated', now())
on conflict (id) do update
set email = excluded.email,
    role = excluded.role,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at);

insert into public.users (id, email, display_name, is_monkey, automation_strategy, status)
values
  ('00000000-0000-0000-0000-000000000005', 'codex@mondial2026.local', 'Codex', false, null, 'approved'),
  ('00000000-0000-0000-0000-000000000006', 'claude@mondial2026.local', 'Claude', false, null, 'approved')
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    is_admin = false,
    is_monkey = false,
    automation_strategy = null,
    status = 'approved';
