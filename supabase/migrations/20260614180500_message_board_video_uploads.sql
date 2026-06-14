-- Allow message board posts to reference Cloudflare R2-hosted videos.

alter table public.message_board_posts
  add column if not exists uploaded_media_type text;

update public.message_board_posts
set uploaded_media_type = 'image/jpeg'
where image_path is not null
  and uploaded_media_type is null;

alter table public.message_board_posts
  drop constraint if exists message_board_posts_uploaded_media_type_check;

alter table public.message_board_posts
  add constraint message_board_posts_uploaded_media_type_check
  check (
    uploaded_media_type is null
    or uploaded_media_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    )
  );

alter table public.message_board_posts
  drop constraint if exists message_board_posts_media_provider_valid;

alter table public.message_board_posts
  add constraint message_board_posts_media_provider_valid check (
    media_provider is null or media_provider in ('giphy', 'cloudflare_r2')
  );
