-- 288: Generalize participation compliance and add temporary member exchange restrictions.
--
-- Participation compliance remains an observation tool. Exchange restrictions are
-- explicit, expiring officer decisions and are never derived from compliance state.

create or replace function public.alliance_content_compliance_enabled(p_guild_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.tenants t
      join public.app_settings s
        on s.guild_id = t.id
       and s.key = 'alliance_content_compliance_enabled'
       and s.value = 'true'
     where t.id = p_guild_id
  );
$$;

insert into public.app_settings (guild_id, key, value, updated_at)
select id, 'alliance_content_compliance_enabled', 'true', now()
  from public.tenants
on conflict (guild_id, key) do nothing;

insert into public.alliance_content_policies (
  guild_id,
  session_gap_minutes,
  weekly_min_sessions,
  weekly_min_participation_rate,
  video_every_sessions,
  video_due_days,
  updated_at
)
select id, 90, 3, 0, 3, 7, now()
  from public.tenants
on conflict (guild_id) do nothing;

create or replace function public.initialize_alliance_content_compliance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_settings (guild_id, key, value, updated_at)
  values (new.id, 'alliance_content_compliance_enabled', 'true', now())
  on conflict (guild_id, key) do nothing;

  insert into public.alliance_content_policies (guild_id)
  values (new.id)
  on conflict (guild_id) do nothing;

  return new;
end;
$$;

drop trigger if exists tenants_initialize_alliance_content_compliance
  on public.tenants;
create trigger tenants_initialize_alliance_content_compliance
after insert on public.tenants
for each row execute function public.initialize_alliance_content_compliance();

create table if not exists public.member_exchange_restrictions (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  blocked_until timestamptz not null,
  reason text not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_id),
  foreign key (guild_id, discord_id)
    references public.guild_avatars(guild_id, discord_id)
    on delete cascade,
  constraint member_exchange_restrictions_reason_check check (
    length(btrim(reason)) > 0 and char_length(reason) <= 500
  ),
  constraint member_exchange_restrictions_created_by_check check (
    length(btrim(created_by)) > 0 and char_length(created_by) <= 128
  ),
  constraint member_exchange_restrictions_updated_by_check check (
    length(btrim(updated_by)) > 0 and char_length(updated_by) <= 128
  )
);

create index if not exists member_exchange_restrictions_expiry_idx
  on public.member_exchange_restrictions (guild_id, blocked_until);

create or replace function public.set_member_exchange_restriction(
  p_guild_id uuid,
  p_discord_id text,
  p_blocked_until timestamptz,
  p_reason text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id = p_discord_id
     and withdrawn_at is null
   for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if p_discord_id like 'local:%' then
    raise exception 'EXCHANGE_RESTRICTION_LOCAL_ACCOUNT';
  end if;
  if p_blocked_until is null
     or p_blocked_until <= now()
     or p_blocked_until > now() + interval '90 days' then
    raise exception 'EXCHANGE_RESTRICTION_INVALID_EXPIRY';
  end if;
  if p_reason is null
     or length(btrim(p_reason)) = 0
     or char_length(btrim(p_reason)) > 500 then
    raise exception 'EXCHANGE_RESTRICTION_INVALID_REASON';
  end if;
  if p_actor is null
     or length(btrim(p_actor)) = 0
     or char_length(p_actor) > 128 then
    raise exception 'EXCHANGE_RESTRICTION_INVALID_ACTOR';
  end if;

  insert into public.member_exchange_restrictions (
    guild_id,
    discord_id,
    blocked_until,
    reason,
    created_by,
    updated_by
  ) values (
    p_guild_id,
    p_discord_id,
    p_blocked_until,
    btrim(p_reason),
    p_actor,
    p_actor
  )
  on conflict (guild_id, discord_id) do update set
    blocked_until = excluded.blocked_until,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

create or replace function public.clear_member_exchange_restriction(
  p_guild_id uuid,
  p_discord_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.member_exchange_restrictions
   where guild_id = p_guild_id
     and discord_id = p_discord_id;
  return found;
end;
$$;

create or replace function public.guard_member_exchange_restriction()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_blocked_until timestamptz;
begin
  select blocked_until
    into v_blocked_until
    from public.member_exchange_restrictions
   where guild_id = new.guild_id
     and discord_id = new.discord_id
     and blocked_until > now();

  if v_blocked_until is not null then
    raise exception 'EXCHANGE_TEMPORARILY_RESTRICTED:%', v_blocked_until;
  end if;
  return new;
end;
$$;

drop trigger if exists exchange_requests_member_restriction_guard
  on public.exchange_requests;
create trigger exchange_requests_member_restriction_guard
before insert on public.exchange_requests
for each row execute function public.guard_member_exchange_restriction();

alter table public.member_exchange_restrictions enable row level security;
revoke all on public.member_exchange_restrictions from anon, authenticated;
grant select, insert, update, delete on public.member_exchange_restrictions to service_role;

revoke all on function public.set_member_exchange_restriction(uuid, text, timestamptz, text, text)
  from public, anon, authenticated;
revoke all on function public.clear_member_exchange_restriction(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_member_exchange_restriction(uuid, text, timestamptz, text, text)
  to service_role;
grant execute on function public.clear_member_exchange_restriction(uuid, text)
  to service_role;

-- Preserve an active restriction when a Discord identity is merged.
alter function public.preview_member_account_merge(uuid, text, text)
  rename to preview_member_account_merge_before_exchange_restrictions;
alter function public.merge_member_accounts(uuid, text, text, text, text)
  rename to merge_member_accounts_before_exchange_restrictions;

create or replace function public.preview_member_account_merge(
  p_guild_id uuid,
  p_from_discord_id text,
  p_to_discord_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_counts jsonb;
  v_blockers jsonb;
  v_warnings jsonb;
  v_source_count integer;
begin
  v_base := public.preview_member_account_merge_before_exchange_restrictions(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id
  );
  v_counts := coalesce(v_base->'counts', '{}'::jsonb);
  v_blockers := coalesce(v_base->'blockers', '[]'::jsonb);
  v_warnings := coalesce(v_base->'warnings', '[]'::jsonb);

  select count(*)::integer
    into v_source_count
    from public.member_exchange_restrictions
   where guild_id = p_guild_id
     and discord_id = p_from_discord_id;

  v_counts := v_counts || jsonb_build_object(
    'member_exchange_restrictions',
    v_source_count
  );

  if exists (
    select 1
      from public.member_exchange_restrictions source
      join public.member_exchange_restrictions target
        on target.guild_id = source.guild_id
       and target.discord_id = p_to_discord_id
     where source.guild_id = p_guild_id
       and source.discord_id = p_from_discord_id
  ) then
    v_blockers := v_blockers || jsonb_build_array(
      'member_exchange_restriction_conflict'
    );
  end if;

  if exists (
    select 1
      from public.member_exchange_restrictions
     where guild_id = p_guild_id
       and discord_id = p_to_discord_id
  ) and not (v_warnings @> '["target_has_existing_data"]'::jsonb) then
    v_warnings := v_warnings || jsonb_build_array('target_has_existing_data');
  end if;

  return v_base || jsonb_build_object(
    'canMerge', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings,
    'counts', v_counts
  );
end;
$$;

create or replace function public.merge_member_accounts(
  p_guild_id uuid,
  p_from_discord_id text,
  p_to_discord_id text,
  p_actor_discord_id text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview jsonb;
  v_base_result jsonb;
  v_moved jsonb;
  v_count integer;
begin
  perform discord_id
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id in (p_from_discord_id, p_to_discord_id)
   order by discord_id
   for update;

  v_preview := public.preview_member_account_merge(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id
  );
  if coalesce((v_preview->>'canMerge')::boolean, false) is not true then
    raise exception 'ACCOUNT_MERGE_BLOCKED: %', v_preview->'blockers';
  end if;

  v_base_result := public.merge_member_accounts_before_exchange_restrictions(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id,
    p_actor_discord_id,
    p_reason
  );
  v_moved := coalesce(v_base_result->'moved', '{}'::jsonb);

  update public.member_exchange_restrictions
     set discord_id = p_to_discord_id,
         updated_by = p_actor_discord_id,
         updated_at = now()
   where guild_id = p_guild_id
     and discord_id = p_from_discord_id;
  get diagnostics v_count = row_count;
  v_moved := v_moved || jsonb_build_object(
    'member_exchange_restrictions',
    v_count
  );

  v_preview := public.preview_member_account_merge(
    p_guild_id,
    p_from_discord_id,
    p_to_discord_id
  );
  return v_preview || jsonb_build_object('moved', v_moved);
end;
$$;

revoke all on function public.preview_member_account_merge(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.merge_member_accounts(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.preview_member_account_merge(uuid, text, text)
  to service_role;
grant execute on function public.merge_member_accounts(uuid, text, text, text, text)
  to service_role;
revoke all on function public.preview_member_account_merge_before_exchange_restrictions(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.merge_member_accounts_before_exchange_restrictions(uuid, text, text, text, text)
  from public, anon, authenticated;

comment on table public.member_exchange_restrictions is
  'Explicit tenant officer decisions that temporarily block only new member exchange requests.';
comment on function public.set_member_exchange_restriction(uuid, text, timestamptz, text, text) is
  'Sets one bounded, expiring exchange-request restriction for an active tenant member.';
comment on function public.clear_member_exchange_restriction(uuid, text) is
  'Lifts a tenant-scoped member exchange restriction without touching pending requests.';
