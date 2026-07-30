-- Phase 2A: stable guild member records.
--
-- This migration is expand-only:
-- - existing Discord-keyed business tables and read paths are unchanged
-- - Discord and guild-local accounts become access identities
-- - Albion characters become period-bearing guild memberships
-- - ambiguous legacy evidence is stored as an unresolved diagnostic instead
--   of merging member records

create table if not exists public.guild_member_records (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,

  status text not null default 'active'
    check (status in ('active', 'withdrawn', 'merged')),
  display_name_snapshot text,
  display_name_override text
    check (
      display_name_override is null
      or char_length(btrim(display_name_override)) between 1 and 64
    ),

  joined_at timestamptz not null default now(),
  last_reactivated_at timestamptz,
  withdrawn_at timestamptz,
  merged_into_member_id uuid,
  source text not null default 'dual_write'
    check (char_length(btrim(source)) between 1 and 64),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guild_member_records_guild_id_id_key unique (guild_id, id),
  constraint guild_member_records_lifecycle_check check (
    (
      status = 'active'
      and withdrawn_at is null
      and merged_into_member_id is null
    )
    or (
      status = 'withdrawn'
      and withdrawn_at is not null
      and merged_into_member_id is null
    )
    or (
      status = 'merged'
      and withdrawn_at is not null
      and merged_into_member_id is not null
      and merged_into_member_id <> id
    )
  )
);

alter table public.guild_member_records
  add constraint guild_member_records_merged_into_fkey
  foreign key (guild_id, merged_into_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict;

create index if not exists guild_member_records_active_idx
  on public.guild_member_records (guild_id, updated_at desc)
  where status = 'active';

create index if not exists guild_member_records_merged_into_idx
  on public.guild_member_records (guild_id, merged_into_member_id)
  where merged_into_member_id is not null;

create table if not exists public.guild_member_access_identities (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  guild_member_id uuid not null,

  identity_type text not null
    check (identity_type in ('discord', 'local')),
  subject_id text not null
    check (char_length(btrim(subject_id)) between 1 and 128),

  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  source text not null default 'dual_write'
    check (char_length(btrim(source)) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guild_member_access_identities_guild_member_fkey
    foreign key (guild_id, guild_member_id)
    references public.guild_member_records(guild_id, id)
    on delete cascade,
  constraint guild_member_access_identities_subject_key
    unique (guild_id, identity_type, subject_id)
);

create index if not exists guild_member_access_identities_member_idx
  on public.guild_member_access_identities (guild_id, guild_member_id);

create index if not exists guild_member_access_identities_active_idx
  on public.guild_member_access_identities (guild_id, identity_type, subject_id)
  where revoked_at is null;

create table if not exists public.guild_character_memberships (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  guild_member_id uuid not null,

  albion_server text not null
    check (albion_server in ('west', 'east', 'europe')),
  albion_player_id text not null
    check (char_length(btrim(albion_player_id)) between 1 and 80),
  albion_player_name text,

  relation text not null default 'unknown'
    check (relation in ('home_guild', 'alliance', 'external', 'unknown')),
  trust_status text not null default 'claimed'
    check (trust_status in ('claimed', 'roster_matched', 'trusted', 'disputed', 'revoked')),

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text,
  source text not null default 'dual_write'
    check (char_length(btrim(source)) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guild_character_memberships_guild_member_fkey
    foreign key (guild_id, guild_member_id)
    references public.guild_member_records(guild_id, id)
    on delete cascade,
  constraint guild_character_memberships_period_check
    check (ended_at is null or ended_at >= started_at)
);

-- A nickname is mutable and is deliberately absent from this key. The
-- official Albion server + player ID can have only one open membership
-- across every tenant.
create unique index if not exists guild_character_memberships_one_active_guild
  on public.guild_character_memberships (albion_server, albion_player_id)
  where ended_at is null;

create index if not exists guild_character_memberships_member_period_idx
  on public.guild_character_memberships
    (guild_id, guild_member_id, started_at desc);

create index if not exists guild_character_memberships_character_history_idx
  on public.guild_character_memberships
    (albion_server, albion_player_id, started_at desc);

-- Fourth identity table from the accepted domain design. It contains only
-- stable internal record references, a one-way fingerprint, and bounded
-- diagnostic metadata. Raw Discord IDs, Albion player IDs, and nicknames are
-- intentionally not copied here.
create table if not exists public.guild_member_identity_conflicts (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  guild_member_id uuid not null,
  conflicting_guild_id uuid references public.tenants(id) on delete cascade,
  conflicting_guild_member_id uuid,

  conflict_type text not null
    check (char_length(btrim(conflict_type)) between 1 and 64),
  identity_fingerprint text not null
    check (identity_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'unresolved'
    check (status in ('unresolved', 'resolved', 'ignored')),
  diagnostic jsonb not null default '{}'::jsonb
    check (jsonb_typeof(diagnostic) = 'object'),

  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guild_member_identity_conflicts_member_fkey
    foreign key (guild_id, guild_member_id)
    references public.guild_member_records(guild_id, id)
    on delete cascade,
  constraint guild_member_identity_conflicts_other_member_fkey
    foreign key (conflicting_guild_id, conflicting_guild_member_id)
    references public.guild_member_records(guild_id, id)
    on delete cascade,
  constraint guild_member_identity_conflicts_other_pair_check check (
    (
      conflicting_guild_id is null
      and conflicting_guild_member_id is null
    )
    or (
      conflicting_guild_id is not null
      and conflicting_guild_member_id is not null
    )
  ),
  constraint guild_member_identity_conflicts_resolution_check check (
    (status = 'unresolved' and resolved_at is null)
    or (status in ('resolved', 'ignored') and resolved_at is not null)
  ),
  constraint guild_member_identity_conflicts_dedupe_key
    unique (guild_id, guild_member_id, conflict_type, identity_fingerprint)
);

create index if not exists guild_member_identity_conflicts_unresolved_idx
  on public.guild_member_identity_conflicts
    (guild_id, last_detected_at desc)
  where status = 'unresolved';

alter table public.guild_member_records enable row level security;
alter table public.guild_member_access_identities enable row level security;
alter table public.guild_character_memberships enable row level security;
alter table public.guild_member_identity_conflicts enable row level security;

revoke all on public.guild_member_records from public, anon, authenticated;
revoke all on public.guild_member_access_identities from public, anon, authenticated;
revoke all on public.guild_character_memberships from public, anon, authenticated;
revoke all on public.guild_member_identity_conflicts from public, anon, authenticated;

grant select, insert, update, delete on public.guild_member_records to service_role;
grant select, insert, update, delete on public.guild_member_access_identities to service_role;
grant select, insert, update, delete on public.guild_character_memberships to service_role;
grant select, insert, update, delete on public.guild_member_identity_conflicts to service_role;

create or replace function public.guild_member_stable_uuid(
  p_namespace text,
  p_values text[]
) returns uuid
language sql
immutable
strict
set search_path = public
as $$
  with hashed as (
    select md5(p_namespace || chr(31) || array_to_string(p_values, chr(31))) as value
  )
  select (
    substr(value, 1, 8) || '-' ||
    substr(value, 9, 4) || '-' ||
    substr(value, 13, 4) || '-' ||
    substr(value, 17, 4) || '-' ||
    substr(value, 21, 12)
  )::uuid
  from hashed;
$$;

create or replace function public.guild_member_identity_fingerprint(
  p_namespace text,
  p_values text[]
) returns text
language sql
immutable
strict
set search_path = public
as $$
  select
    md5('left:' || p_namespace || chr(31) || array_to_string(p_values, chr(31))) ||
    md5('right:' || p_namespace || chr(31) || array_to_string(p_values, chr(31)));
$$;

create or replace function public.guild_member_access_identity_type(
  p_subject_id text
) returns text
language sql
immutable
strict
set search_path = public
as $$
  select case
    when p_subject_id like 'local:%' then 'local'
    else 'discord'
  end;
$$;

create or replace function public.record_guild_member_identity_conflict(
  p_guild_id uuid,
  p_guild_member_id uuid,
  p_conflict_type text,
  p_identity_fingerprint text,
  p_conflicting_guild_id uuid default null,
  p_conflicting_guild_member_id uuid default null,
  p_diagnostic jsonb default '{}'::jsonb,
  p_detected_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_guild_id is null or p_guild_member_id is null then
    raise exception 'GUILD_MEMBER_REQUIRED';
  end if;
  if p_conflict_type is null
     or char_length(btrim(p_conflict_type)) not between 1 and 64 then
    raise exception 'INVALID_IDENTITY_CONFLICT_TYPE';
  end if;
  if p_identity_fingerprint is null
     or p_identity_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_IDENTITY_FINGERPRINT';
  end if;
  if (p_conflicting_guild_id is null) <>
     (p_conflicting_guild_member_id is null) then
    raise exception 'CONFLICTING_MEMBER_PAIR_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_diagnostic, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_IDENTITY_DIAGNOSTIC';
  end if;

  insert into public.guild_member_identity_conflicts (
    id,
    guild_id,
    guild_member_id,
    conflicting_guild_id,
    conflicting_guild_member_id,
    conflict_type,
    identity_fingerprint,
    status,
    diagnostic,
    first_detected_at,
    last_detected_at,
    created_at,
    updated_at
  ) values (
    public.guild_member_stable_uuid(
      'guild-member-identity-conflict',
      array[
        p_guild_id::text,
        p_guild_member_id::text,
        p_conflict_type,
        p_identity_fingerprint
      ]
    ),
    p_guild_id,
    p_guild_member_id,
    p_conflicting_guild_id,
    p_conflicting_guild_member_id,
    p_conflict_type,
    p_identity_fingerprint,
    'unresolved',
    coalesce(p_diagnostic, '{}'::jsonb),
    p_detected_at,
    p_detected_at,
    p_detected_at,
    p_detected_at
  )
  on conflict (
    guild_id,
    guild_member_id,
    conflict_type,
    identity_fingerprint
  ) do update
    set conflicting_guild_id = excluded.conflicting_guild_id,
        conflicting_guild_member_id = excluded.conflicting_guild_member_id,
        diagnostic = public.guild_member_identity_conflicts.diagnostic || excluded.diagnostic,
        last_detected_at = greatest(
          public.guild_member_identity_conflicts.last_detected_at,
          excluded.last_detected_at
        ),
        updated_at = greatest(
          public.guild_member_identity_conflicts.updated_at,
          excluded.updated_at
        )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.ensure_guild_member_access_identity(
  p_guild_id uuid,
  p_identity_type text,
  p_subject_id text,
  p_active boolean,
  p_display_name text default null,
  p_source text default 'dual_write',
  p_observed_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_id text := btrim(coalesce(p_subject_id, ''));
  v_identity_type text := btrim(coalesce(p_identity_type, ''));
  v_source text := left(coalesce(nullif(btrim(p_source), ''), 'dual_write'), 64);
  v_member_id uuid;
  v_candidate_id uuid;
  v_was_status text;
begin
  if p_guild_id is null then
    raise exception 'GUILD_ID_REQUIRED';
  end if;
  if v_identity_type not in ('discord', 'local') then
    raise exception 'INVALID_ACCESS_IDENTITY_TYPE';
  end if;
  if char_length(v_subject_id) not between 1 and 128 then
    raise exception 'INVALID_ACCESS_IDENTITY_SUBJECT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_guild_id::text || ':guild-member-access:' ||
      v_identity_type || ':' || v_subject_id,
      0
    )
  );

  select access.guild_member_id
    into v_member_id
    from public.guild_member_access_identities access
   where access.guild_id = p_guild_id
     and access.identity_type = v_identity_type
     and access.subject_id = v_subject_id
   for update;

  if v_member_id is null then
    v_candidate_id := public.guild_member_stable_uuid(
      'guild-member-record',
      array[p_guild_id::text, v_identity_type, v_subject_id]
    );

    insert into public.guild_member_records (
      id,
      guild_id,
      status,
      display_name_snapshot,
      joined_at,
      last_reactivated_at,
      withdrawn_at,
      source,
      created_at,
      updated_at
    ) values (
      v_candidate_id,
      p_guild_id,
      case when p_active then 'active' else 'withdrawn' end,
      nullif(btrim(coalesce(p_display_name, '')), ''),
      p_observed_at,
      case when p_active then p_observed_at else null end,
      case when p_active then null else p_observed_at end,
      v_source,
      p_observed_at,
      p_observed_at
    )
    on conflict (id) do nothing;

    select member.id
      into v_member_id
      from public.guild_member_records member
     where member.id = v_candidate_id
       and member.guild_id = p_guild_id
     for update;

    if v_member_id is null then
      raise exception 'GUILD_MEMBER_STABLE_ID_COLLISION';
    end if;

    insert into public.guild_member_access_identities (
      id,
      guild_id,
      guild_member_id,
      identity_type,
      subject_id,
      linked_at,
      last_seen_at,
      revoked_at,
      source,
      created_at,
      updated_at
    ) values (
      public.guild_member_stable_uuid(
        'guild-member-access-identity',
        array[p_guild_id::text, v_identity_type, v_subject_id]
      ),
      p_guild_id,
      v_member_id,
      v_identity_type,
      v_subject_id,
      p_observed_at,
      p_observed_at,
      case when p_active then null else p_observed_at end,
      v_source,
      p_observed_at,
      p_observed_at
    )
    on conflict (guild_id, identity_type, subject_id) do update
      set last_seen_at = greatest(
            public.guild_member_access_identities.last_seen_at,
            excluded.last_seen_at
          ),
          revoked_at = case
            when p_active then null
            else coalesce(
              public.guild_member_access_identities.revoked_at,
              excluded.revoked_at
            )
          end,
          updated_at = greatest(
            public.guild_member_access_identities.updated_at,
            excluded.updated_at
          )
    returning guild_member_id into v_member_id;
  else
    update public.guild_member_access_identities
       set last_seen_at = greatest(last_seen_at, p_observed_at),
           revoked_at = case
             when p_active then null
             else coalesce(revoked_at, p_observed_at)
           end,
           updated_at = greatest(updated_at, p_observed_at)
     where guild_id = p_guild_id
       and identity_type = v_identity_type
       and subject_id = v_subject_id;
  end if;

  select status
    into v_was_status
    from public.guild_member_records
   where guild_id = p_guild_id
     and id = v_member_id
   for update;

  if v_was_status <> 'merged' then
    if exists (
      select 1
        from public.guild_member_access_identities access
       where access.guild_id = p_guild_id
         and access.guild_member_id = v_member_id
         and access.revoked_at is null
    ) then
      update public.guild_member_records
         set status = 'active',
             display_name_snapshot = coalesce(
               nullif(btrim(coalesce(p_display_name, '')), ''),
               display_name_snapshot
             ),
             last_reactivated_at = case
               when status = 'withdrawn' then p_observed_at
               else last_reactivated_at
             end,
             withdrawn_at = null,
             updated_at = greatest(updated_at, p_observed_at)
       where guild_id = p_guild_id
         and id = v_member_id;
    else
      update public.guild_member_records
         set status = 'withdrawn',
             display_name_snapshot = coalesce(
               nullif(btrim(coalesce(p_display_name, '')), ''),
               display_name_snapshot
             ),
             withdrawn_at = coalesce(withdrawn_at, p_observed_at),
             updated_at = greatest(updated_at, p_observed_at)
       where guild_id = p_guild_id
         and id = v_member_id;
    end if;
  end if;

  return v_member_id;
end;
$$;

create or replace function public.attach_guild_member_access_identity(
  p_guild_id uuid,
  p_guild_member_id uuid,
  p_identity_type text,
  p_subject_id text,
  p_source text default 'identity_link',
  p_observed_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_id text := btrim(coalesce(p_subject_id, ''));
  v_identity_type text := btrim(coalesce(p_identity_type, ''));
  v_source text := left(coalesce(nullif(btrim(p_source), ''), 'identity_link'), 64);
  v_existing_member_id uuid;
  v_fingerprint text;
begin
  if p_guild_id is null or p_guild_member_id is null then
    raise exception 'GUILD_MEMBER_REQUIRED';
  end if;
  if v_identity_type not in ('discord', 'local') then
    raise exception 'INVALID_ACCESS_IDENTITY_TYPE';
  end if;
  if char_length(v_subject_id) not between 1 and 128 then
    raise exception 'INVALID_ACCESS_IDENTITY_SUBJECT';
  end if;
  if not exists (
    select 1
      from public.guild_member_records member
     where member.guild_id = p_guild_id
       and member.id = p_guild_member_id
       and member.status <> 'merged'
  ) then
    raise exception 'GUILD_MEMBER_NOT_ACTIVE_RECORD';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_guild_id::text || ':guild-member-access:' ||
      v_identity_type || ':' || v_subject_id,
      0
    )
  );

  select access.guild_member_id
    into v_existing_member_id
    from public.guild_member_access_identities access
   where access.guild_id = p_guild_id
     and access.identity_type = v_identity_type
     and access.subject_id = v_subject_id
   for update;

  if v_existing_member_id is not null
     and v_existing_member_id <> p_guild_member_id then
    v_fingerprint := public.guild_member_identity_fingerprint(
      'access-identity-member-conflict',
      array[
        p_guild_id::text,
        least(v_existing_member_id::text, p_guild_member_id::text),
        greatest(v_existing_member_id::text, p_guild_member_id::text),
        v_identity_type
      ]
    );
    perform public.record_guild_member_identity_conflict(
      p_guild_id,
      p_guild_member_id,
      'access_identity_already_linked',
      v_fingerprint,
      p_guild_id,
      v_existing_member_id,
      jsonb_build_object(
        'identityType', v_identity_type,
        'source', v_source
      ),
      p_observed_at
    );
    return v_existing_member_id;
  end if;

  if v_existing_member_id is null then
    insert into public.guild_member_access_identities (
      id,
      guild_id,
      guild_member_id,
      identity_type,
      subject_id,
      linked_at,
      last_seen_at,
      revoked_at,
      source,
      created_at,
      updated_at
    ) values (
      public.guild_member_stable_uuid(
        'guild-member-access-identity',
        array[p_guild_id::text, v_identity_type, v_subject_id]
      ),
      p_guild_id,
      p_guild_member_id,
      v_identity_type,
      v_subject_id,
      p_observed_at,
      p_observed_at,
      null,
      v_source,
      p_observed_at,
      p_observed_at
    );
  else
    update public.guild_member_access_identities
       set revoked_at = null,
           last_seen_at = greatest(last_seen_at, p_observed_at),
           updated_at = greatest(updated_at, p_observed_at)
     where guild_id = p_guild_id
       and identity_type = v_identity_type
       and subject_id = v_subject_id;
  end if;

  update public.guild_member_records
     set status = 'active',
         last_reactivated_at = case
           when status = 'withdrawn' then p_observed_at
           else last_reactivated_at
         end,
         withdrawn_at = null,
         updated_at = greatest(updated_at, p_observed_at)
   where guild_id = p_guild_id
     and id = p_guild_member_id
     and status <> 'merged';

  return p_guild_member_id;
end;
$$;

create or replace function public.end_guild_character_membership(
  p_guild_id uuid,
  p_guild_member_id uuid,
  p_albion_server text,
  p_albion_player_id text,
  p_ended_reason text default 'legacy_identity_inactive',
  p_ended_at timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_guild_id is null
     or p_guild_member_id is null
     or p_albion_server not in ('west', 'east', 'europe')
     or nullif(btrim(coalesce(p_albion_player_id, '')), '') is null then
    return 0;
  end if;

  update public.guild_character_memberships membership
     set ended_at = greatest(membership.started_at, p_ended_at),
         ended_reason = left(
           coalesce(nullif(btrim(p_ended_reason), ''), 'legacy_identity_inactive'),
           128
         ),
         updated_at = greatest(membership.updated_at, p_ended_at)
   where membership.guild_id = p_guild_id
     and membership.guild_member_id = p_guild_member_id
     and membership.albion_server = p_albion_server
     and membership.albion_player_id = btrim(p_albion_player_id)
     and membership.ended_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.sync_guild_character_membership(
  p_guild_id uuid,
  p_guild_member_id uuid,
  p_albion_server text,
  p_albion_player_id text,
  p_albion_player_name text,
  p_relation text,
  p_trust_status text,
  p_active boolean,
  p_source text default 'dual_write',
  p_observed_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id text := btrim(coalesce(p_albion_player_id, ''));
  v_source text := left(coalesce(nullif(btrim(p_source), ''), 'dual_write'), 64);
  v_relation text := coalesce(nullif(btrim(p_relation), ''), 'unknown');
  v_trust_status text := coalesce(nullif(btrim(p_trust_status), ''), 'claimed');
  v_existing public.guild_character_memberships%rowtype;
  v_id uuid;
  v_fingerprint text;
begin
  if p_guild_id is null or p_guild_member_id is null then
    raise exception 'GUILD_MEMBER_REQUIRED';
  end if;
  if p_albion_server not in ('west', 'east', 'europe') then
    raise exception 'INVALID_ALBION_SERVER';
  end if;
  if char_length(v_player_id) not between 1 and 80 then
    raise exception 'INVALID_ALBION_PLAYER_ID';
  end if;
  if v_relation not in ('home_guild', 'alliance', 'external', 'unknown') then
    raise exception 'INVALID_CHARACTER_RELATION';
  end if;
  if v_trust_status not in ('claimed', 'roster_matched', 'trusted', 'disputed', 'revoked') then
    raise exception 'INVALID_CHARACTER_TRUST_STATUS';
  end if;
  if not exists (
    select 1
      from public.guild_member_records member
     where member.guild_id = p_guild_id
       and member.id = p_guild_member_id
       and member.status <> 'merged'
  ) then
    raise exception 'GUILD_MEMBER_NOT_ACTIVE_RECORD';
  end if;

  if not p_active or v_trust_status in ('disputed', 'revoked') then
    if v_trust_status = 'disputed' then
      v_fingerprint := public.guild_member_identity_fingerprint(
        'disputed-character-claim',
        array[p_albion_server, v_player_id]
      );
      perform public.record_guild_member_identity_conflict(
        p_guild_id,
        p_guild_member_id,
        'disputed_character_claim',
        v_fingerprint,
        null,
        null,
        jsonb_build_object(
          'relation', v_relation,
          'trustStatus', v_trust_status,
          'source', v_source
        ),
        p_observed_at
      );
    end if;

    perform public.end_guild_character_membership(
      p_guild_id,
      p_guild_member_id,
      p_albion_server,
      v_player_id,
      case
        when v_trust_status = 'disputed' then 'identity_disputed'
        when v_trust_status = 'revoked' then 'identity_revoked'
        else 'member_withdrawn'
      end,
      p_observed_at
    );
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'guild-character-membership:' ||
      p_albion_server || ':' || v_player_id,
      0
    )
  );

  select membership.*
    into v_existing
    from public.guild_character_memberships membership
   where membership.albion_server = p_albion_server
     and membership.albion_player_id = v_player_id
     and membership.ended_at is null
   for update;

  if v_existing.id is not null then
    if v_existing.guild_id <> p_guild_id
       or v_existing.guild_member_id <> p_guild_member_id then
      v_fingerprint := public.guild_member_identity_fingerprint(
        'active-character-membership-conflict',
        array[p_albion_server, v_player_id]
      );
      perform public.record_guild_member_identity_conflict(
        p_guild_id,
        p_guild_member_id,
        'character_active_elsewhere',
        v_fingerprint,
        v_existing.guild_id,
        v_existing.guild_member_id,
        jsonb_build_object(
          'relation', v_relation,
          'trustStatus', v_trust_status,
          'source', v_source
        ),
        p_observed_at
      );
      return null;
    end if;

    update public.guild_character_memberships
       set albion_player_name = coalesce(
             nullif(btrim(coalesce(p_albion_player_name, '')), ''),
             albion_player_name
           ),
           relation = v_relation,
           trust_status = v_trust_status,
           source = v_source,
           updated_at = greatest(updated_at, p_observed_at)
     where id = v_existing.id
    returning id into v_id;
    return v_id;
  end if;

  insert into public.guild_character_memberships (
    guild_id,
    guild_member_id,
    albion_server,
    albion_player_id,
    albion_player_name,
    relation,
    trust_status,
    started_at,
    source,
    created_at,
    updated_at
  ) values (
    p_guild_id,
    p_guild_member_id,
    p_albion_server,
    v_player_id,
    nullif(btrim(coalesce(p_albion_player_name, '')), ''),
    v_relation,
    v_trust_status,
    p_observed_at,
    v_source,
    p_observed_at,
    p_observed_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.merge_guild_member_records(
  p_guild_id uuid,
  p_source_guild_member_id uuid,
  p_target_guild_member_id uuid,
  p_observed_at timestamptz default now()
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_status text;
  v_target_status text;
begin
  if p_guild_id is null
     or p_source_guild_member_id is null
     or p_target_guild_member_id is null then
    raise exception 'GUILD_MEMBER_REQUIRED';
  end if;
  if p_source_guild_member_id = p_target_guild_member_id then
    return false;
  end if;

  perform id
    from public.guild_member_records
   where guild_id = p_guild_id
     and id in (p_source_guild_member_id, p_target_guild_member_id)
   order by id
   for update;

  select status into v_source_status
    from public.guild_member_records
   where guild_id = p_guild_id
     and id = p_source_guild_member_id;
  select status into v_target_status
    from public.guild_member_records
   where guild_id = p_guild_id
     and id = p_target_guild_member_id;

  if v_source_status is null or v_target_status is null then
    raise exception 'GUILD_MEMBER_NOT_FOUND';
  end if;
  if v_source_status = 'merged' then
    return false;
  end if;
  if v_target_status = 'merged' then
    raise exception 'TARGET_GUILD_MEMBER_ALREADY_MERGED';
  end if;

  update public.guild_member_access_identities
     set guild_member_id = p_target_guild_member_id,
         updated_at = greatest(updated_at, p_observed_at)
   where guild_id = p_guild_id
     and guild_member_id = p_source_guild_member_id;

  update public.guild_character_memberships
     set guild_member_id = p_target_guild_member_id,
         updated_at = greatest(updated_at, p_observed_at)
   where guild_id = p_guild_id
     and guild_member_id = p_source_guild_member_id;

  update public.guild_member_records
     set status = 'merged',
         withdrawn_at = coalesce(withdrawn_at, p_observed_at),
         merged_into_member_id = p_target_guild_member_id,
         updated_at = greatest(updated_at, p_observed_at)
   where guild_id = p_guild_id
     and id = p_source_guild_member_id;

  update public.guild_member_records
     set status = 'active',
         display_name_snapshot = coalesce(
           display_name_snapshot,
           (
             select source.display_name_snapshot
               from public.guild_member_records source
              where source.guild_id = p_guild_id
                and source.id = p_source_guild_member_id
           )
         ),
         last_reactivated_at = case
           when status = 'withdrawn' then p_observed_at
           else last_reactivated_at
         end,
         withdrawn_at = null,
         updated_at = greatest(updated_at, p_observed_at)
   where guild_id = p_guild_id
     and id = p_target_guild_member_id;

  return true;
end;
$$;

revoke all on function public.guild_member_stable_uuid(text, text[]) from public, anon, authenticated;
revoke all on function public.guild_member_identity_fingerprint(text, text[]) from public, anon, authenticated;
revoke all on function public.guild_member_access_identity_type(text) from public, anon, authenticated;
revoke all on function public.record_guild_member_identity_conflict(uuid, uuid, text, text, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.ensure_guild_member_access_identity(uuid, text, text, boolean, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.attach_guild_member_access_identity(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.end_guild_character_membership(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sync_guild_character_membership(uuid, uuid, text, text, text, text, text, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function public.merge_guild_member_records(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.guild_member_stable_uuid(text, text[]) to service_role;
grant execute on function public.guild_member_identity_fingerprint(text, text[]) to service_role;
grant execute on function public.guild_member_access_identity_type(text) to service_role;
grant execute on function public.record_guild_member_identity_conflict(uuid, uuid, text, text, uuid, uuid, jsonb, timestamptz) to service_role;
grant execute on function public.ensure_guild_member_access_identity(uuid, text, text, boolean, text, text, timestamptz) to service_role;
grant execute on function public.attach_guild_member_access_identity(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.end_guild_character_membership(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.sync_guild_character_membership(uuid, uuid, text, text, text, text, text, boolean, text, timestamptz) to service_role;
grant execute on function public.merge_guild_member_records(uuid, uuid, uuid, timestamptz) to service_role;

comment on table public.guild_member_records is
  'Stable tenant-scoped business subject. Access providers and Albion characters are linked through separate tables.';
comment on table public.guild_member_access_identities is
  'Tenant-scoped Discord or guild-local login identities attached to one stable guild member record.';
comment on table public.guild_character_memberships is
  'Period-bearing Albion character links keyed by official server and player ID, never by mutable nickname.';
comment on table public.guild_member_identity_conflicts is
  'Unresolved identity evidence that Phase 2A deliberately did not auto-merge. Diagnostic JSON must not contain raw external identifiers.';
comment on index public.guild_character_memberships_one_active_guild is
  'Prevents one official Albion character from having simultaneous active links across guilds.';
