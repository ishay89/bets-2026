-- Allow message board posts to reference provider-hosted GIFs.

alter table public.message_board_posts
  add column if not exists media_provider text,
  add column if not exists media_provider_id text,
  add column if not exists media_url text,
  add column if not exists media_preview_url text,
  add column if not exists media_title text,
  add column if not exists media_width integer,
  add column if not exists media_height integer;

alter table public.message_board_posts
  drop constraint if exists message_board_posts_content_required;

alter table public.message_board_posts
  add constraint message_board_posts_content_required check (
    nullif(trim(body), '') is not null
    or nullif(trim(image_path), '') is not null
    or nullif(trim(media_url), '') is not null
  );

alter table public.message_board_posts
  add constraint message_board_posts_media_provider_valid check (
    media_provider is null or media_provider in ('giphy')
  );

alter table public.message_board_posts
  add constraint message_board_posts_media_dimensions_positive check (
    (media_width is null or media_width > 0)
    and (media_height is null or media_height > 0)
  );
