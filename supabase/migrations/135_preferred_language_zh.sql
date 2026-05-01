-- Add 'zh' (Simplified Chinese) to preferred_language CHECK constraint.
-- Mirrors SUPPORTED_LOCALES in src/i18n/locales.ts after zh-CN rollout.
--
-- mig 038 added the check inline, so the constraint name is auto-generated.
-- Drop any existing check on preferred_language (regardless of name) before
-- re-adding with the widened set, so this works even if the name drifted.

do $$
declare
  c record;
begin
  for c in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.guild_avatars'::regclass,
        'public.guests'::regclass
      )
      and pg_get_constraintdef(oid) ilike '%preferred_language%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.guild_avatars
  add constraint guild_avatars_preferred_language_check
    check (preferred_language in ('ko','en','ja','zh'));

alter table public.guests
  add constraint guests_preferred_language_check
    check (preferred_language in ('ko','en','ja','zh'));
