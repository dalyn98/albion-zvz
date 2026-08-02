-- Release C: light-touch Albion home-guild ownership disputes.
-- Normal onboarding remains self-serve. A dispute can only be submitted after
-- the selected official guild is already linked to another workspace, and a
-- submission alone never changes either workspace or its public surface.

create table if not exists public.guild_home_ownership_disputes (
  id uuid primary key default gen_random_uuid(),
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  albion_guild_id text not null check (
    char_length(btrim(albion_guild_id)) between 1 and 500
  ),
  albion_guild_name text not null check (
    char_length(btrim(albion_guild_name)) between 1 and 200
  ),
  incumbent_guild_id uuid not null references public.tenants(id) on delete cascade,
  claimant_guild_id uuid not null references public.tenants(id) on delete cascade,
  reporter_discord_id text not null check (
    char_length(btrim(reporter_discord_id)) between 1 and 128
  ),
  status text not null default 'submitted' check (status in (
    'submitted', 'under_review', 'resolved_existing',
    'resolved_reassigned', 'rejected', 'cancelled'
  )),
  evidence_summary text check (
    evidence_summary is null
    or char_length(btrim(evidence_summary)) between 20 and 2000
  ),
  evidence_purged_at timestamptz,
  reviewer_discord_id text,
  resolution_note text check (
    resolution_note is null
    or char_length(btrim(resolution_note)) between 10 and 2000
  ),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint guild_home_ownership_disputes_distinct_workspaces check (
    incumbent_guild_id <> claimant_guild_id
  ),
  constraint guild_home_ownership_disputes_review_shape check (
    (status = 'submitted' and reviewed_at is null and resolved_at is null)
    or (status = 'under_review' and reviewed_at is not null and resolved_at is null)
    or (status in ('resolved_existing', 'resolved_reassigned', 'rejected', 'cancelled')
        and resolved_at is not null)
  )
);

create unique index if not exists guild_home_ownership_disputes_open_claim_idx
  on public.guild_home_ownership_disputes (
    albion_guild_id, claimant_guild_id
  )
  where status in ('submitted', 'under_review');

create index if not exists guild_home_ownership_disputes_incumbent_idx
  on public.guild_home_ownership_disputes (
    incumbent_guild_id, status, submitted_at desc
  );

create index if not exists guild_home_ownership_disputes_queue_idx
  on public.guild_home_ownership_disputes (status, submitted_at asc)
  where status in ('submitted', 'under_review');

alter table public.guild_home_ownership_disputes enable row level security;
revoke all on table public.guild_home_ownership_disputes
  from public, anon, authenticated, service_role;
grant select on table public.guild_home_ownership_disputes to service_role;

create or replace function public.submit_guild_home_ownership_dispute(
  p_claimant_guild_id uuid,
  p_albion_server text,
  p_albion_guild_id text,
  p_albion_guild_name text,
  p_reporter_discord_id text,
  p_evidence_summary text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server text := btrim(coalesce(p_albion_server, ''));
  v_albion_guild_id text := btrim(coalesce(p_albion_guild_id, ''));
  v_albion_guild_name text := btrim(coalesce(p_albion_guild_name, ''));
  v_reporter text := btrim(coalesce(p_reporter_discord_id, ''));
  v_evidence text := btrim(coalesce(p_evidence_summary, ''));
  v_incumbent_guild_id uuid;
  v_existing public.guild_home_ownership_disputes%rowtype;
  v_created public.guild_home_ownership_disputes%rowtype;
begin
  if v_server not in ('west', 'east', 'europe')
     or char_length(v_albion_guild_id) not between 1 and 500
     or char_length(v_albion_guild_name) not between 1 and 200
     or char_length(v_reporter) not between 1 and 128
     or char_length(v_evidence) not between 20 and 2000 then
    raise exception 'INVALID_HOME_GUILD_DISPUTE_INPUT';
  end if;

  if not exists (
    select 1 from public.tenants tenant
     where tenant.id = p_claimant_guild_id
       and tenant.status in ('pending', 'active')
  ) then
    raise exception 'CLAIMANT_WORKSPACE_NOT_AVAILABLE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('home-guild-dispute:' || v_albion_guild_id, 0)
  );

  select setting.guild_id into v_incumbent_guild_id
    from public.app_settings setting
    join public.tenants tenant on tenant.id = setting.guild_id
   where setting.key = 'albion_home_guild_id'
     and setting.value = v_albion_guild_id
     and setting.guild_id <> p_claimant_guild_id
     and tenant.status <> 'deleted'
   limit 1;

  if v_incumbent_guild_id is null then
    raise exception 'HOME_GUILD_NOT_CURRENTLY_CLAIMED';
  end if;

  select * into v_existing
    from public.guild_home_ownership_disputes dispute
   where dispute.albion_guild_id = v_albion_guild_id
     and dispute.claimant_guild_id = p_claimant_guild_id
     and dispute.status in ('submitted', 'under_review')
   limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'created', false
    );
  end if;

  if (
    select count(*)
      from public.guild_home_ownership_disputes dispute
     where dispute.reporter_discord_id = v_reporter
       and dispute.submitted_at >= now() - interval '24 hours'
  ) >= 3 then
    raise exception 'HOME_GUILD_DISPUTE_RATE_LIMITED';
  end if;

  insert into public.guild_home_ownership_disputes (
    albion_server,
    albion_guild_id,
    albion_guild_name,
    incumbent_guild_id,
    claimant_guild_id,
    reporter_discord_id,
    evidence_summary
  ) values (
    v_server,
    v_albion_guild_id,
    v_albion_guild_name,
    v_incumbent_guild_id,
    p_claimant_guild_id,
    v_reporter,
    v_evidence
  ) returning * into v_created;

  return jsonb_build_object(
    'id', v_created.id,
    'status', v_created.status,
    'created', true
  );
end;
$$;

create or replace function public.review_guild_home_ownership_dispute(
  p_dispute_id uuid,
  p_action text,
  p_reviewer_discord_id text,
  p_resolution_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := btrim(coalesce(p_action, ''));
  v_reviewer text := btrim(coalesce(p_reviewer_discord_id, ''));
  v_note text := btrim(coalesce(p_resolution_note, ''));
  v_dispute public.guild_home_ownership_disputes%rowtype;
begin
  if v_action not in ('start_review', 'keep_existing', 'reject', 'reassign')
     or char_length(v_reviewer) not between 1 and 128 then
    raise exception 'INVALID_HOME_GUILD_DISPUTE_REVIEW_INPUT';
  end if;
  if v_action <> 'start_review' and char_length(v_note) not between 10 and 2000 then
    raise exception 'HOME_GUILD_DISPUTE_RESOLUTION_NOTE_REQUIRED';
  end if;

  select * into v_dispute
    from public.guild_home_ownership_disputes dispute
   where dispute.id = p_dispute_id
   for update;
  if v_dispute.id is null then
    raise exception 'HOME_GUILD_DISPUTE_NOT_FOUND';
  end if;

  if v_action = 'start_review' then
    if v_dispute.status = 'under_review' then
      return jsonb_build_object(
        'id', v_dispute.id,
        'status', v_dispute.status,
        'incumbentGuildId', v_dispute.incumbent_guild_id,
        'claimantGuildId', v_dispute.claimant_guild_id,
        'changed', false
      );
    end if;
    if v_dispute.status <> 'submitted' then
      raise exception 'HOME_GUILD_DISPUTE_NOT_SUBMITTED';
    end if;
    update public.guild_home_ownership_disputes
       set status = 'under_review',
           reviewer_discord_id = v_reviewer,
           reviewed_at = now(),
           updated_at = now()
     where id = v_dispute.id;
    return jsonb_build_object(
      'id', v_dispute.id,
      'status', 'under_review',
      'incumbentGuildId', v_dispute.incumbent_guild_id,
      'claimantGuildId', v_dispute.claimant_guild_id,
      'changed', true
    );
  end if;

  if (v_action = 'keep_existing' and v_dispute.status = 'resolved_existing')
     or (v_action = 'reject' and v_dispute.status = 'rejected')
     or (v_action = 'reassign' and v_dispute.status = 'resolved_reassigned') then
    return jsonb_build_object(
      'id', v_dispute.id,
      'status', v_dispute.status,
      'incumbentGuildId', v_dispute.incumbent_guild_id,
      'claimantGuildId', v_dispute.claimant_guild_id,
      'changed', false
    );
  end if;
  if v_dispute.status <> 'under_review' then
    raise exception 'HOME_GUILD_DISPUTE_NOT_UNDER_REVIEW';
  end if;

  if v_action = 'reassign' then
    if not exists (
      select 1 from public.app_settings setting
       where setting.guild_id = v_dispute.incumbent_guild_id
         and setting.key = 'albion_home_guild_id'
         and setting.value = v_dispute.albion_guild_id
    ) then
      raise exception 'HOME_GUILD_INCUMBENT_LINK_CHANGED';
    end if;

    insert into public.app_settings (guild_id, key, value, updated_at)
    values
      (v_dispute.incumbent_guild_id, 'albion_home_guild_id', '', now()),
      (v_dispute.incumbent_guild_id, 'albion_home_guild_name', '', now())
    on conflict (guild_id, key) do update
      set value = excluded.value, updated_at = excluded.updated_at;

    insert into public.app_settings (guild_id, key, value, updated_at)
    values
      (v_dispute.claimant_guild_id, 'albion_server', v_dispute.albion_server, now()),
      (v_dispute.claimant_guild_id, 'albion_home_guild_id', v_dispute.albion_guild_id, now()),
      (v_dispute.claimant_guild_id, 'albion_home_guild_name', v_dispute.albion_guild_name, now())
    on conflict (guild_id, key) do update
      set value = excluded.value, updated_at = excluded.updated_at;

    perform public.change_guild_feature_state(
      v_dispute.incumbent_guild_id,
      'public_guild_profile',
      'setup_required',
      '{}'::jsonb,
      v_reviewer
    );
  end if;

  update public.guild_home_ownership_disputes
     set status = case v_action
           when 'keep_existing' then 'resolved_existing'
           when 'reject' then 'rejected'
           else 'resolved_reassigned'
         end,
         reviewer_discord_id = v_reviewer,
         resolution_note = v_note,
         evidence_summary = null,
         evidence_purged_at = now(),
         resolved_at = now(),
         updated_at = now()
   where id = v_dispute.id;

  return jsonb_build_object(
    'id', v_dispute.id,
    'status', case v_action
      when 'keep_existing' then 'resolved_existing'
      when 'reject' then 'rejected'
      else 'resolved_reassigned'
    end,
    'incumbentGuildId', v_dispute.incumbent_guild_id,
    'claimantGuildId', v_dispute.claimant_guild_id,
    'changed', true,
    'homeGuildReassigned', v_action = 'reassign'
  );
end;
$$;

revoke all on function public.submit_guild_home_ownership_dispute(
  uuid, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.submit_guild_home_ownership_dispute(
  uuid, text, text, text, text, text
) to service_role;

revoke all on function public.review_guild_home_ownership_dispute(
  uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.review_guild_home_ownership_dispute(
  uuid, text, text, text
) to service_role;

comment on table public.guild_home_ownership_disputes is
  'Exceptional, authenticated ownership-dispute queue for duplicate official Albion home-guild links. Submission alone never suspends a public surface.';
comment on function public.submit_guild_home_ownership_dispute(
  uuid, text, text, text, text, text
) is
  'Creates or reuses one authenticated duplicate-link dispute with a 24-hour reporter rate limit and no automatic suspension.';
comment on function public.review_guild_home_ownership_dispute(
  uuid, text, text, text
) is
  'Starts manual review or resolves a dispute. Reassignment clears only the incumbent home-guild link, never transfers tenant business data, and returns its public profile feature to setup_required.';
