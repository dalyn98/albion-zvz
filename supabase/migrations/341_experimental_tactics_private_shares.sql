-- 341: Make tactics an explicit experimental tenant feature and ensure every
-- bearer share link is finite-lived. Existing tactics users keep access; new
-- and unused tenants remain fail-closed until an administrator opts in.

insert into public.app_settings (guild_id, key, value, updated_at)
select existing.guild_id, 'tactics_experimental_enabled', 'true', clock_timestamp()
from (
  select board.guild_id from public.tactic_boards board
  union
  select snapshot.guild_id from public.event_tactic_snapshots snapshot
) existing
on conflict (guild_id, key) do nothing;

-- Previously issued links without an expiry receive a seven-day transition
-- window. The bearer token itself is never materialized by this migration.
update public.tactic_share_links link
set expires_at = greatest(
  clock_timestamp() + interval '7 days',
  link.created_at + interval '1 second'
)
where link.expires_at is null;

alter table public.tactic_share_links
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;

alter table public.tactic_share_links
  add constraint tactic_share_links_expiry_after_creation
  check (expires_at > created_at)
  not valid;

alter table public.tactic_share_links
  validate constraint tactic_share_links_expiry_after_creation;

-- These documents are read only through tenant-authorized server code or a
-- hashed bearer token lookup. PostgREST callers never receive table access.
revoke all on table public.tactic_boards from public, anon, authenticated;
revoke all on table public.tactic_steps from public, anon, authenticated;
revoke all on table public.tactic_share_links from public, anon, authenticated;

grant select, insert, update, delete on table public.tactic_boards to service_role;
grant select, insert, update, delete on table public.tactic_steps to service_role;
grant select, insert, update, delete on table public.tactic_share_links to service_role;

create or replace function public.issue_tactic_share_link(
  p_guild_id uuid,
  p_board_id uuid,
  p_token_hash text,
  p_created_by text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_link_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'tactic_share_token_hash_invalid';
  end if;
  if p_created_by is null
     or length(btrim(p_created_by)) = 0
     or char_length(p_created_by) > 128 then
    raise exception 'tactic_share_actor_invalid';
  end if;
  if p_expires_at is null
     or p_expires_at <= v_now
     or p_expires_at > v_now + interval '8 days' then
    raise exception 'tactic_share_expiry_invalid';
  end if;
  if not exists (
    select 1
    from public.app_settings setting
    where setting.guild_id = p_guild_id
      and setting.key = 'tactics_experimental_enabled'
      and setting.value = 'true'
  ) then
    raise exception 'tactics_experimental_disabled';
  end if;

  update public.tactic_boards board
  set status = 'published',
      visibility = 'share',
      updated_by = btrim(p_created_by),
      updated_at = v_now
  where board.guild_id = p_guild_id
    and board.id = p_board_id
    and board.status <> 'archived';
  if not found then
    raise exception 'tactic_not_found';
  end if;

  insert into public.tactic_share_links (
    guild_id,
    board_id,
    token_hash,
    expires_at,
    created_by
  ) values (
    p_guild_id,
    p_board_id,
    p_token_hash,
    p_expires_at,
    btrim(p_created_by)
  )
  returning id into v_link_id;

  return v_link_id;
end;
$$;

create or replace function public.revoke_tactic_share_link(
  p_guild_id uuid,
  p_board_id uuid,
  p_link_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.tactic_share_links link
  set revoked_at = coalesce(link.revoked_at, clock_timestamp())
  where link.guild_id = p_guild_id
    and link.board_id = p_board_id
    and link.id = p_link_id;
  return found;
end;
$$;

revoke all on function public.issue_tactic_share_link(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.issue_tactic_share_link(
  uuid, uuid, text, text, timestamptz
) to service_role;

revoke all on function public.revoke_tactic_share_link(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.revoke_tactic_share_link(
  uuid, uuid, uuid
) to service_role;

create or replace function public.revoke_tactic_shares_when_disabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key = 'tactics_experimental_enabled'
     and new.value is distinct from 'true' then
    update public.tactic_share_links link
    set revoked_at = coalesce(link.revoked_at, clock_timestamp())
    where link.guild_id = new.guild_id
      and link.revoked_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists revoke_tactic_shares_when_disabled
  on public.app_settings;
create trigger revoke_tactic_shares_when_disabled
after insert or update of value on public.app_settings
for each row execute function public.revoke_tactic_shares_when_disabled();

revoke all on function public.revoke_tactic_shares_when_disabled()
  from public, anon, authenticated, service_role;

comment on table public.tactic_boards is
  'Guild-authored experimental tactic documents. The product does not attest to tactic correctness.';
comment on table public.tactic_share_links is
  'Finite-lived, revocable, unlisted read-only tactic bearer links. Only SHA-256 token hashes are stored.';
comment on column public.tactic_share_links.expires_at is
  'Mandatory expiry for an unlisted tactic bearer link; application-issued links default to seven days.';
comment on function public.issue_tactic_share_link(uuid, uuid, text, text, timestamptz) is
  'Atomically publishes a non-archived guild tactic and issues a finite bearer link while the experimental feature is enabled.';
comment on function public.revoke_tactic_share_link(uuid, uuid, uuid) is
  'Idempotently revokes one guild-scoped tactic bearer link without deleting its audit row.';
comment on function public.revoke_tactic_shares_when_disabled() is
  'Irreversibly revokes active tactic bearer links when a tenant disables the experimental feature.';
