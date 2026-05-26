# Supabase Setup

Run these migrations in order in the Supabase SQL Editor (Dashboard → SQL Editor):

1. `migrations/001_schema.sql` — Creates all tables and the leaderboard view
2. `migrations/002_rls.sql` — Enables Row Level Security on all tables

After running migrations, also run this to create The Monkey player:

```sql
insert into auth.users (id, email, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'monkey@mondial2026.local', 'authenticated', now());

insert into public.users (id, email, display_name, is_monkey) values
  ('00000000-0000-0000-0000-000000000001', 'monkey@mondial2026.local', '🐒 Monkey', true);
```
