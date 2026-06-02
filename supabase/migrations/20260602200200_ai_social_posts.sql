-- Mondial Bets 2026 - generated social recaps

create table public.ai_social_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  match_day_id uuid references public.match_days(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ai_social_posts_title_length check (
    char_length(trim(title)) between 1 and 120
  ),
  constraint ai_social_posts_body_length check (
    char_length(trim(body)) between 1 and 4000
  )
);

create index ai_social_posts_created_at_idx
  on public.ai_social_posts (created_at desc);

alter table public.ai_social_posts enable row level security;

create policy "ai_social_posts_read_authenticated"
  on public.ai_social_posts for select
  to authenticated
  using (true);

grant select on public.ai_social_posts to authenticated;

alter publication supabase_realtime add table public.ai_social_posts;
