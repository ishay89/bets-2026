# Supabase Setup

## Prerequisites

Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started):

```bash
npm install -g supabase
# or: brew install supabase/tap/supabase
```

## One-time setup

1. Fill in `project_id` in `supabase/config.toml` (find it in the Supabase Dashboard → Settings → General).
2. Log in: `supabase login`

## Applying migrations

Push all pending migrations to your linked project:

```bash
supabase db push
```

To add a new migration:

```bash
supabase migration new <descriptive_name>
# Edit the generated file, then:
supabase db push
```

## Seeded baseline users

Migrations create four automated benchmark users for leaderboard comparison:

- **Monkey** (`00000000-…-0001`): random reproducible picks  
- **Always Max** (`00000000-…-0002`): highest-odds pick  
- **Always Mid** (`00000000-…-0003`): median-odds pick  
- **Always Min** (`00000000-…-0004`): lowest-odds pick  

These are idempotent (`on conflict do nothing / do update`), so re-running migrations is safe.

## Manual fallback

If you don't have the CLI set up, you can still apply migrations by running each `.sql` file
**in order** (001 → 011) in the Supabase Dashboard → SQL Editor.
