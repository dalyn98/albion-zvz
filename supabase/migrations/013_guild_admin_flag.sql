-- Mark which guild_avatars rows represent admins.
-- The flag is refreshed on every Discord login via upsertGuildAvatar, so it
-- can be slightly stale (e.g. user loses the admin role but hasn't logged back
-- in). That's acceptable — same staleness window as the cached avatar hash.
alter table public.guild_avatars
  add column if not exists is_admin boolean not null default false;
