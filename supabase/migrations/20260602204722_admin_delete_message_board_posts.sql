-- Mondial Bets 2026 - allow admins to moderate Social posts

drop policy if exists "message_board_posts_delete_own"
  on public.message_board_posts;

create policy "message_board_posts_delete_own_or_admin"
  on public.message_board_posts for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.is_admin
    )
  );

drop policy if exists "message_board_images_delete_own"
  on storage.objects;

create policy "message_board_images_delete_own_or_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-board-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.is_admin
      )
    )
  );
