-- Bomb squad caller role gating: admin-configured Discord role IDs designate
-- who qualifies as a bomb-squad caller. The per-party caller picker filters
-- guild_avatars by `is_bomb_squad_caller`, which is re-computed each login.
--
-- Approval authorization (assigned per-party caller + event creator + admin)
-- is unchanged; this migration only adds the pool-gating flag.

alter table public.guild_avatars
  add column if not exists is_bomb_squad_caller boolean not null default false;

-- Per-party caller dropdown query is `select ... where is_bomb_squad_caller`;
-- the partial index keeps that filter cheap as guild size grows.
create index if not exists idx_guild_avatars_bomb_caller
  on public.guild_avatars (username)
  where is_bomb_squad_caller = true;
