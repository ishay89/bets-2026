create table if not exists public.tournament_settings (
  id boolean primary key default true check (id = true),
  futures_locked boolean not null default false
);

insert into public.tournament_settings (id, futures_locked)
values (true, false)
on conflict (id) do nothing;
