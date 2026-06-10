-- Keep Storage writes aligned with the private approved-user board policy.

drop policy if exists "message_board_images_insert_own" on storage.objects;
create policy "message_board_images_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'message-board-images'
    and private.is_approved_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "message_board_images_delete_own_or_admin" on storage.objects;
create policy "message_board_images_delete_own_or_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'message-board-images'
    and private.is_approved_user()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
    )
  );
