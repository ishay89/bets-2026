-- Adds a publish toggle for the pre-tournament futures (winner & top scorer),
-- mirroring the per-item publishing used for matches and pikanteria.
-- Defaults to true so existing live futures stay visible after the migration;
-- admins can unpublish to hide them from /predict.
alter table public.tournament_settings
  add column if not exists futures_published boolean not null default true;
