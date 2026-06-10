-- The web app is private behind Supabase Auth and app-level approval.
-- Anonymous visitors do not need direct PostgREST access to public schema data.

alter default privileges in schema public
  revoke all privileges on tables from anon;

alter default privileges in schema public
  revoke all privileges on sequences from anon;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
