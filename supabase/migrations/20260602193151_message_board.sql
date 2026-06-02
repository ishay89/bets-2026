-- Mondial Bets 2026 - player message board

create table public.message_board_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  body text,
  image_path text,
  created_at timestamptz not null default now(),
  constraint message_board_posts_content_required check (
    nullif(trim(body), '') is not null or nullif(trim(image_path), '') is not null
  ),
  constraint message_board_posts_body_length check (
    body is null or char_length(body) <= 1000
  )
);

create index message_board_posts_created_at_idx
  on public.message_board_posts (created_at desc);

alter table public.message_board_posts enable row level security;

create policy "message_board_posts_read_authenticated"
  on public.message_board_posts for select
  to authenticated
  using (true);

create policy "message_board_posts_insert_own"
  on public.message_board_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "message_board_posts_delete_own"
  on public.message_board_posts for delete
  to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-board-images',
  'message-board-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "message_board_images_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-board-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "message_board_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-board-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

alter publication supabase_realtime add table public.message_board_posts;
