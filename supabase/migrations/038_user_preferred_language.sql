-- Persist each user's UI language choice alongside their Discord identity.
-- Previously the active locale lived only in the `lang` cookie, which meant
-- a user logging in from a new device (or after clearing cookies) would fall
-- back to the default regardless of their preference.
--
-- Nullable by design: a null value marks "user has never chosen" and triggers
-- the first-visit language selector. The CHECK constraint mirrors
-- SUPPORTED_LOCALES in src/i18n/locales.ts — keep them in sync.

alter table public.guild_avatars
  add column if not exists preferred_language text
    check (preferred_language in ('ko','en','ja'));

alter table public.guests
  add column if not exists preferred_language text
    check (preferred_language in ('ko','en','ja'));
