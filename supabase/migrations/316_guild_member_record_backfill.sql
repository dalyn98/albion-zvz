-- Phase 2A deterministic legacy backfill.
--
-- The function is intentionally retained as a service-role repair primitive:
-- rerunning it converges on the same member/access/history/conflict rows.
-- Active character evidence that points at more than one member record is
-- skipped for every claimant and preserved as an unresolved diagnostic.

create or replace function public.backfill_guild_member_records()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_attached_member_id uuid;
  v_history_id uuid;
  v_fingerprint text;
  v_access_conflicts integer := 0;
  v_character_conflicts integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('backfill-guild-member-records', 0)
  );

  -- Current guild_avatars rows are the compatibility member registry.
  for v_row in
    select
      avatar.guild_id,
      avatar.discord_id,
      avatar.username,
      avatar.withdrawn_at,
      avatar.updated_at
    from public.guild_avatars avatar
    order by avatar.guild_id, avatar.discord_id
  loop
    perform public.ensure_guild_member_access_identity(
      v_row.guild_id,
      public.guild_member_access_identity_type(v_row.discord_id),
      v_row.discord_id,
      v_row.withdrawn_at is null,
      v_row.username,
      'legacy_guild_avatar',
      coalesce(v_row.updated_at, v_row.withdrawn_at, now())
    );
  end loop;

  -- Local credentials are access identities even when a legacy shadow avatar
  -- is missing. Matching local:<uuid> subjects converge on the record already
  -- created from guild_avatars.
  for v_row in
    select
      account.guild_id,
      account.subject,
      account.albion_player_name,
      account.trust_status,
      account.revoked_at,
      account.updated_at
    from public.guild_local_accounts account
    order by account.guild_id, account.subject
  loop
    perform public.ensure_guild_member_access_identity(
      v_row.guild_id,
      'local',
      v_row.subject,
      v_row.revoked_at is null and v_row.trust_status <> 'revoked',
      v_row.albion_player_name,
      'legacy_local_account',
      coalesce(v_row.updated_at, v_row.revoked_at, now())
    );
  end loop;

  -- Tenant Albion links can outlive a missing compatibility avatar. They
  -- still get a stable, withdrawn member record, but they do not become
  -- active without current guild/local membership evidence.
  for v_row in
    select
      link.guild_id,
      link.discord_id,
      link.albion_player_name,
      link.updated_at,
      (
        exists (
          select 1
          from public.guild_avatars avatar
          where avatar.guild_id = link.guild_id
            and avatar.discord_id = link.discord_id
            and avatar.withdrawn_at is null
        )
        or exists (
          select 1
          from public.guild_local_accounts account
          where account.guild_id = link.guild_id
            and account.subject = link.discord_id
            and account.revoked_at is null
            and account.trust_status <> 'revoked'
        )
      ) as has_active_access
    from public.account_albion_tenant_links link
    order by link.guild_id, link.discord_id
  loop
    perform public.ensure_guild_member_access_identity(
      v_row.guild_id,
      public.guild_member_access_identity_type(v_row.discord_id),
      v_row.discord_id,
      v_row.has_active_access,
      v_row.albion_player_name,
      'legacy_albion_tenant_link',
      coalesce(v_row.updated_at, now())
    );
  end loop;

  -- An explicit legacy linked_discord_id is enough to attach a previously
  -- unseen Discord access identity to the local member record. If that
  -- Discord identity already belongs to another record, attach_* records an
  -- unresolved conflict and leaves both records separate.
  for v_row in
    select
      account.guild_id,
      account.subject,
      account.linked_discord_id,
      account.updated_at,
      access.guild_member_id
    from public.guild_local_accounts account
    join public.guild_member_access_identities access
      on access.guild_id = account.guild_id
     and access.identity_type = 'local'
     and access.subject_id = account.subject
    where nullif(btrim(account.linked_discord_id), '') is not null
    order by account.guild_id, account.subject
  loop
    v_attached_member_id := public.attach_guild_member_access_identity(
      v_row.guild_id,
      v_row.guild_member_id,
      'discord',
      v_row.linked_discord_id,
      'legacy_local_discord_link',
      coalesce(v_row.updated_at, now())
    );
    if v_attached_member_id <> v_row.guild_member_id then
      v_access_conflicts := v_access_conflicts + 1;
    end if;
  end loop;

  -- Preserve contradictions between the two current character sources. The
  -- fingerprint is one-way; diagnostic JSON contains only classifications.
  for v_row in
    select
      link.guild_id,
      access.guild_member_id,
      link.albion_server as link_server,
      link.albion_player_id as link_player_id,
      link.trust_status,
      link.revoked_at,
      avatar.albion_server as avatar_server,
      avatar.albion_player_id as avatar_player_id,
      avatar.withdrawn_at,
      greatest(link.updated_at, avatar.updated_at) as observed_at
    from public.account_albion_tenant_links link
    join public.guild_avatars avatar
      on avatar.guild_id = link.guild_id
     and avatar.discord_id = link.discord_id
    join public.guild_member_access_identities access
      on access.guild_id = link.guild_id
     and access.identity_type =
       public.guild_member_access_identity_type(link.discord_id)
     and access.subject_id = link.discord_id
    where nullif(btrim(link.albion_player_id), '') is not null
      and nullif(btrim(avatar.albion_player_id), '') is not null
      and (
        link.albion_server is distinct from avatar.albion_server
        or link.albion_player_id is distinct from avatar.albion_player_id
      )
    order by link.guild_id, access.guild_member_id
  loop
    v_fingerprint := public.guild_member_identity_fingerprint(
      'legacy-character-source-mismatch',
      array[
        least(
          v_row.link_server || ':' || v_row.link_player_id,
          v_row.avatar_server || ':' || v_row.avatar_player_id
        ),
        greatest(
          v_row.link_server || ':' || v_row.link_player_id,
          v_row.avatar_server || ':' || v_row.avatar_player_id
        )
      ]
    );
    perform public.record_guild_member_identity_conflict(
      v_row.guild_id,
      v_row.guild_member_id,
      'legacy_character_source_mismatch',
      v_fingerprint,
      null,
      null,
      jsonb_build_object(
        'linkTrustStatus', v_row.trust_status,
        'linkRevoked', v_row.revoked_at is not null,
        'memberWithdrawn', v_row.withdrawn_at is not null,
        'source', 'legacy_backfill'
      ),
      coalesce(v_row.observed_at, now())
    );
    v_character_conflicts := v_character_conflicts + 1;
  end loop;

  -- Disputed claims never create or reopen a character membership.
  for v_row in
    select
      link.guild_id,
      access.guild_member_id,
      link.albion_server,
      link.albion_player_id,
      link.relation,
      link.updated_at
    from public.account_albion_tenant_links link
    join public.guild_member_access_identities access
      on access.guild_id = link.guild_id
     and access.identity_type =
       public.guild_member_access_identity_type(link.discord_id)
     and access.subject_id = link.discord_id
    where link.trust_status = 'disputed'
      and nullif(btrim(link.albion_player_id), '') is not null
    order by link.guild_id, access.guild_member_id
  loop
    v_fingerprint := public.guild_member_identity_fingerprint(
      'disputed-character-claim',
      array[v_row.albion_server, btrim(v_row.albion_player_id)]
    );
    perform public.record_guild_member_identity_conflict(
      v_row.guild_id,
      v_row.guild_member_id,
      'disputed_character_claim',
      v_fingerprint,
      null,
      null,
      jsonb_build_object(
        'relation', v_row.relation,
        'trustStatus', 'disputed',
        'source', 'legacy_backfill'
      ),
      coalesce(v_row.updated_at, now())
    );
    v_character_conflicts := v_character_conflicts + 1;
  end loop;

  -- Select one deterministic source per (member, official character). An
  -- active tenant link wins over guild_avatars, which wins over a local
  -- credential row. Revoked evidence is retained as a closed period.
  for v_row in
    with raw_candidates as (
      select
        link.guild_id,
        access.guild_member_id,
        link.albion_server,
        btrim(link.albion_player_id) as albion_player_id,
        link.albion_player_name,
        link.relation,
        link.trust_status,
        member.joined_at as started_at,
        (
          member.status = 'active'
          and link.revoked_at is null
          and link.trust_status <> 'revoked'
        ) as is_active,
        case
          when member.status = 'active'
            and link.revoked_at is null
            and link.trust_status <> 'revoked'
          then null
          else coalesce(
            link.revoked_at,
            member.withdrawn_at,
            link.updated_at,
            now()
          )
        end as ended_at,
        link.updated_at as observed_at,
        'legacy_albion_tenant_link'::text as source,
        1 as source_priority
      from public.account_albion_tenant_links link
      join public.guild_member_access_identities access
        on access.guild_id = link.guild_id
       and access.identity_type =
         public.guild_member_access_identity_type(link.discord_id)
       and access.subject_id = link.discord_id
      join public.guild_member_records member
        on member.guild_id = access.guild_id
       and member.id = access.guild_member_id
      where nullif(btrim(link.albion_player_id), '') is not null
        and link.trust_status <> 'disputed'

      union all

      select
        avatar.guild_id,
        access.guild_member_id,
        avatar.albion_server,
        btrim(avatar.albion_player_id),
        coalesce(nullif(btrim(avatar.albion_nickname), ''), avatar.username),
        case
          when avatar.albion_verified_at is not null then 'home_guild'
          else 'unknown'
        end,
        case
          when avatar.albion_verified_at is not null then 'trusted'
          else 'claimed'
        end,
        member.joined_at,
        member.status = 'active',
        case
          when member.status = 'active' then null
          else coalesce(member.withdrawn_at, avatar.updated_at, now())
        end,
        avatar.updated_at,
        'legacy_guild_avatar',
        2
      from public.guild_avatars avatar
      join public.guild_member_access_identities access
        on access.guild_id = avatar.guild_id
       and access.identity_type =
         public.guild_member_access_identity_type(avatar.discord_id)
       and access.subject_id = avatar.discord_id
      join public.guild_member_records member
        on member.guild_id = access.guild_id
       and member.id = access.guild_member_id
      where avatar.albion_server in ('west', 'east', 'europe')
        and nullif(btrim(avatar.albion_player_id), '') is not null
        and not exists (
          select 1
          from public.account_albion_tenant_links link
          where link.guild_id = avatar.guild_id
            and link.discord_id = avatar.discord_id
            and nullif(btrim(link.albion_player_id), '') is not null
            and link.revoked_at is null
            and link.trust_status <> 'revoked'
        )

      union all

      select
        account.guild_id,
        access.guild_member_id,
        account.albion_server,
        btrim(account.albion_player_id),
        account.albion_player_name,
        account.relation,
        account.trust_status,
        member.joined_at,
        (
          member.status = 'active'
          and account.revoked_at is null
          and account.trust_status <> 'revoked'
        ),
        case
          when member.status = 'active'
            and account.revoked_at is null
            and account.trust_status <> 'revoked'
          then null
          else coalesce(
            account.revoked_at,
            member.withdrawn_at,
            account.updated_at,
            now()
          )
        end,
        account.updated_at,
        'legacy_local_account',
        3
      from public.guild_local_accounts account
      join public.guild_member_access_identities access
        on access.guild_id = account.guild_id
       and access.identity_type = 'local'
       and access.subject_id = account.subject
      join public.guild_member_records member
        on member.guild_id = access.guild_id
       and member.id = access.guild_member_id
      where nullif(btrim(account.albion_player_id), '') is not null
        and not exists (
          select 1
          from public.account_albion_tenant_links link
          where link.guild_id = account.guild_id
            and link.discord_id = account.subject
            and nullif(btrim(link.albion_player_id), '') is not null
            and link.revoked_at is null
            and link.trust_status <> 'revoked'
        )
        and not exists (
          select 1
          from public.guild_avatars avatar
          where avatar.guild_id = account.guild_id
            and avatar.discord_id = account.subject
            and nullif(btrim(avatar.albion_player_id), '') is not null
        )
    ),
    ranked as (
      select
        candidate.*,
        row_number() over (
          partition by
            candidate.guild_id,
            candidate.guild_member_id,
            candidate.albion_server,
            candidate.albion_player_id
          order by
            candidate.is_active desc,
            candidate.source_priority,
            candidate.observed_at desc nulls last,
            candidate.source
        ) as source_rank
      from raw_candidates candidate
    ),
    chosen as (
      select *
      from ranked
      where source_rank = 1
    ),
    ambiguous as (
      select
        albion_server,
        albion_player_id,
        count(*) as claimant_count
      from chosen
      where is_active
      group by albion_server, albion_player_id
      having count(*) > 1
    )
    select
      chosen.*,
      ambiguous.claimant_count,
      other.guild_id as conflicting_guild_id,
      other.guild_member_id as conflicting_guild_member_id
    from chosen
    left join ambiguous
      on ambiguous.albion_server = chosen.albion_server
     and ambiguous.albion_player_id = chosen.albion_player_id
    left join lateral (
      select
        other_candidate.guild_id,
        other_candidate.guild_member_id
      from chosen other_candidate
      where other_candidate.is_active
        and other_candidate.albion_server = chosen.albion_server
        and other_candidate.albion_player_id = chosen.albion_player_id
        and (
          other_candidate.guild_id <> chosen.guild_id
          or other_candidate.guild_member_id <> chosen.guild_member_id
        )
      order by other_candidate.guild_id, other_candidate.guild_member_id
      limit 1
    ) other on true
    order by
      chosen.albion_server,
      chosen.albion_player_id,
      chosen.guild_id,
      chosen.guild_member_id
  loop
    if v_row.is_active and v_row.claimant_count is not null then
      v_fingerprint := public.guild_member_identity_fingerprint(
        'ambiguous-legacy-active-character',
        array[v_row.albion_server, v_row.albion_player_id]
      );
      perform public.record_guild_member_identity_conflict(
        v_row.guild_id,
        v_row.guild_member_id,
        'ambiguous_legacy_active_character',
        v_fingerprint,
        v_row.conflicting_guild_id,
        v_row.conflicting_guild_member_id,
        jsonb_build_object(
          'claimantCount', v_row.claimant_count,
          'relation', v_row.relation,
          'trustStatus', v_row.trust_status,
          'source', v_row.source
        ),
        coalesce(v_row.observed_at, now())
      );
      v_character_conflicts := v_character_conflicts + 1;
      continue;
    end if;

    if v_row.is_active then
      perform public.sync_guild_character_membership(
        v_row.guild_id,
        v_row.guild_member_id,
        v_row.albion_server,
        v_row.albion_player_id,
        v_row.albion_player_name,
        v_row.relation,
        v_row.trust_status,
        true,
        v_row.source,
        v_row.started_at
      );
      continue;
    end if;

    v_history_id := public.guild_member_stable_uuid(
      'legacy-guild-character-membership',
      array[
        v_row.guild_id::text,
        v_row.guild_member_id::text,
        v_row.albion_server,
        v_row.albion_player_id
      ]
    );
    insert into public.guild_character_memberships (
      id,
      guild_id,
      guild_member_id,
      albion_server,
      albion_player_id,
      albion_player_name,
      relation,
      trust_status,
      started_at,
      ended_at,
      ended_reason,
      source,
      created_at,
      updated_at
    ) values (
      v_history_id,
      v_row.guild_id,
      v_row.guild_member_id,
      v_row.albion_server,
      v_row.albion_player_id,
      nullif(btrim(coalesce(v_row.albion_player_name, '')), ''),
      v_row.relation,
      v_row.trust_status,
      v_row.started_at,
      greatest(
        v_row.started_at,
        coalesce(v_row.ended_at, v_row.observed_at, now())
      ),
      'legacy_identity_inactive',
      v_row.source,
      v_row.started_at,
      greatest(
        v_row.started_at,
        coalesce(v_row.ended_at, v_row.observed_at, now())
      )
    )
    on conflict (id) do update
      set albion_player_name = coalesce(
            excluded.albion_player_name,
            public.guild_character_memberships.albion_player_name
          ),
          relation = excluded.relation,
          trust_status = excluded.trust_status,
          ended_at = excluded.ended_at,
          ended_reason = excluded.ended_reason,
          source = excluded.source,
          updated_at = greatest(
            public.guild_character_memberships.updated_at,
            excluded.updated_at
          );
  end loop;

  return jsonb_build_object(
    'memberRecords', (
      select count(*) from public.guild_member_records
    ),
    'accessIdentities', (
      select count(*) from public.guild_member_access_identities
    ),
    'characterMemberships', (
      select count(*) from public.guild_character_memberships
    ),
    'unresolvedConflicts', (
      select count(*)
      from public.guild_member_identity_conflicts
      where status = 'unresolved'
    ),
    'localDiscordAccessConflictsObserved', v_access_conflicts,
    'characterConflictsObserved', v_character_conflicts
  );
end;
$$;

revoke all on function public.backfill_guild_member_records()
  from public, anon, authenticated;
grant execute on function public.backfill_guild_member_records()
  to service_role;

comment on function public.backfill_guild_member_records() is
  'Idempotent Phase 2A repair/backfill. Ambiguous active character evidence is diagnosed and skipped, never auto-merged.';

select public.backfill_guild_member_records();
