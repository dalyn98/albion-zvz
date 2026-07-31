-- 326: Tenant lifecycle commands and purge claim/finalize protocol.
--
-- All commands are service-role only. Application authorization (live Discord
-- capability checks) is repeated with state, confirmation, and recent-auth
-- invariants inside the database transaction.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.tenant_activation_blocker(
  p_guild_id uuid
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_timezone text;
  v_albion_server text;
  v_home_guild_id text;
  v_home_guild_name text;
  v_regear_support text;
  v_craft_regear text;
  v_events_auto_start text;
begin
  select tenant.*
    into v_tenant
    from public.tenants tenant
   where tenant.id = p_guild_id;

  if v_tenant.id is null then return 'TENANT_NOT_FOUND'; end if;
  if v_tenant.bot_installed_at is null then return 'ONBOARDING_BOT_REQUIRED'; end if;
  if cardinality(v_tenant.member_role_ids) = 0
     or cardinality(v_tenant.admin_role_ids) = 0 then
    return 'ONBOARDING_ROLES_REQUIRED';
  end if;
  if nullif(btrim(coalesce(v_tenant.event_channel_id, '')), '') is null then
    return 'ONBOARDING_EVENT_CHANNEL_REQUIRED';
  end if;

  select
    max(setting.value) filter (where setting.key = 'tenant_timezone'),
    max(setting.value) filter (where setting.key = 'albion_server'),
    max(setting.value) filter (where setting.key = 'albion_home_guild_id'),
    max(setting.value) filter (where setting.key = 'albion_home_guild_name'),
    max(setting.value) filter (where setting.key = 'regear_support_enabled'),
    max(setting.value) filter (where setting.key = 'craft_regear_enabled'),
    max(setting.value) filter (where setting.key = 'events_auto_start_enabled')
    into
      v_timezone,
      v_albion_server,
      v_home_guild_id,
      v_home_guild_name,
      v_regear_support,
      v_craft_regear,
      v_events_auto_start
    from public.app_settings setting
   where setting.guild_id = p_guild_id
     and setting.key in (
       'tenant_timezone',
       'albion_server',
       'albion_home_guild_id',
       'albion_home_guild_name',
       'regear_support_enabled',
       'craft_regear_enabled',
       'events_auto_start_enabled'
     );

  if nullif(btrim(coalesce(v_timezone, '')), '') is null
     or not exists (
       select 1
         from pg_catalog.pg_timezone_names timezone
        where timezone.name = v_timezone
     ) then
    return 'ONBOARDING_TIMEZONE_REQUIRED';
  end if;
  if coalesce(v_albion_server, '') not in ('west', 'east', 'europe')
     or nullif(btrim(coalesce(v_home_guild_id, '')), '') is null
     or nullif(btrim(coalesce(v_home_guild_name, '')), '') is null then
    return 'ONBOARDING_HOME_GUILD_REQUIRED';
  end if;
  if coalesce(v_regear_support, '') not in ('true', 'false') then
    return 'ONBOARDING_REGEAR_SUPPORT_REQUIRED';
  end if;
  if v_regear_support = 'true'
     and coalesce(v_craft_regear, '') not in ('true', 'false') then
    return 'ONBOARDING_REGEAR_MODE_REQUIRED';
  end if;
  if coalesce(v_events_auto_start, '') not in ('true', 'false') then
    return 'ONBOARDING_EVENT_START_REQUIRED';
  end if;

  return null;
end;
$$;

revoke all on function public.tenant_activation_blocker(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.tenant_activation_readiness(
  p_guild_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ready', public.tenant_activation_blocker(p_guild_id) is null,
    'blocker', public.tenant_activation_blocker(p_guild_id)
  );
$$;

revoke all on function public.tenant_activation_readiness(uuid)
  from public, anon, authenticated;
grant execute on function public.tenant_activation_readiness(uuid)
  to service_role;

create or replace function public.activate_tenant_after_onboarding(
  p_guild_id uuid,
  p_actor_discord_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_blocker text;
begin
  select tenant.*
    into v_tenant
    from public.tenants tenant
   where tenant.id = p_guild_id
   for update;

  if v_tenant.id is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  if nullif(btrim(coalesce(p_actor_discord_id, '')), '') is null
     or v_tenant.created_by_discord_id is distinct from p_actor_discord_id then
    raise exception 'ONBOARDING_OWNER_REQUIRED';
  end if;
  if v_tenant.status not in ('pending', 'active', 'suspended')
     or (
       v_tenant.status = 'suspended'
       and coalesce(v_tenant.lifecycle_reason, '') not in (
         'bot_removed',
         'configuration_incomplete'
       )
     ) then
    raise exception 'TENANT_NOT_ACTIVATABLE';
  end if;

  v_blocker := public.tenant_activation_blocker(p_guild_id);
  if v_blocker is not null then
    raise exception '%', v_blocker;
  end if;

  update public.tenants tenant
     set status = 'active',
         lifecycle_reason = null,
         lifecycle_changed_at = clock_timestamp(),
         lifecycle_changed_by = p_actor_discord_id,
         bot_removed_at = null,
         inactivity_warning_at = null
   where tenant.id = p_guild_id;

  return v_tenant.slug;
end;
$$;

revoke all on function public.activate_tenant_after_onboarding(uuid, text)
  from public, anon, authenticated;
grant execute on function public.activate_tenant_after_onboarding(uuid, text)
  to service_role;

create or replace function public.restore_tenant_after_bot_install(
  p_guild_id uuid,
  p_guild_name text,
  p_installer_discord_id text
) returns table (
  tenant_status text,
  tenant_slug text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next_status text;
  v_blocker text;
begin
  select tenant.*
    into v_tenant
    from public.tenants tenant
   where tenant.id = p_guild_id
   for update;

  if v_tenant.id is null then raise exception 'TENANT_NOT_FOUND'; end if;
  if v_tenant.status = 'deleted' then raise exception 'TENANT_DELETED'; end if;
  if nullif(btrim(coalesce(p_guild_name, '')), '') is null then
    raise exception 'INVALID_GUILD_NAME';
  end if;
  if nullif(btrim(coalesce(p_installer_discord_id, '')), '') is null then
    raise exception 'INVALID_INSTALLER';
  end if;
  if v_tenant.created_by_discord_id is not null
     and v_tenant.created_by_discord_id <> p_installer_discord_id then
    raise exception 'ONBOARDING_OWNER_REQUIRED';
  end if;

  update public.tenants tenant
     set name = btrim(p_guild_name),
         bot_installed_at = v_now,
         bot_removed_at = null,
         created_by_discord_id = coalesce(
           tenant.created_by_discord_id,
           p_installer_discord_id
         )
   where tenant.id = p_guild_id;

  v_next_status := v_tenant.status;
  if v_tenant.status = 'suspended'
     and coalesce(v_tenant.lifecycle_reason, '') in (
       'bot_removed',
       'configuration_incomplete'
     ) then
    v_blocker := public.tenant_activation_blocker(p_guild_id);
    if v_blocker is null then
      v_next_status := 'active';
      update public.tenants tenant
         set status = 'active',
             lifecycle_reason = null,
             lifecycle_changed_at = v_now,
             lifecycle_changed_by = p_installer_discord_id,
             inactivity_warning_at = null
       where tenant.id = p_guild_id;
    else
      v_next_status := 'suspended';
      update public.tenants tenant
         set lifecycle_reason = 'configuration_incomplete',
             lifecycle_changed_at = v_now,
             lifecycle_changed_by = p_installer_discord_id
       where tenant.id = p_guild_id;
    end if;
  end if;

  return query
  select v_next_status, v_tenant.slug;
end;
$$;

revoke all on function public.restore_tenant_after_bot_install(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.restore_tenant_after_bot_install(uuid, text, text)
  to service_role;

create or replace function public.suspend_tenant_for_bot_removal(
  p_guild_id uuid,
  p_observed_at timestamptz default clock_timestamp()
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_observed_at timestamptz := coalesce(p_observed_at, clock_timestamp());
begin
  select tenant.*
    into v_tenant
    from public.tenants tenant
   where tenant.id = p_guild_id
   for update;

  if v_tenant.id is null then return false; end if;
  if v_observed_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'INVALID_BOT_REMOVAL_TIME';
  end if;
  if v_tenant.status in ('deleted') then return false; end if;
  if v_tenant.status = 'suspended'
     and v_tenant.lifecycle_reason = 'bot_removed'
     and v_tenant.bot_installed_at is null then
    return false;
  end if;

  update public.tenants tenant
     set status = case
           when tenant.status = 'active' then 'suspended'
           else tenant.status
         end,
         lifecycle_reason = case
           when tenant.status = 'active' then 'bot_removed'
           when tenant.status = 'suspended'
             and tenant.lifecycle_reason in (
               'bot_removed',
               'configuration_incomplete'
             ) then 'bot_removed'
           else tenant.lifecycle_reason
         end,
         lifecycle_changed_at = v_observed_at,
         lifecycle_changed_by = 'system:discord_reconcile',
         bot_installed_at = null,
         bot_removed_at = v_observed_at
   where tenant.id = p_guild_id;

  update public.event_guest_tokens token
     set revoked_at = coalesce(token.revoked_at, v_observed_at)
   where token.guild_id = p_guild_id
     and token.revoked_at is null;

  update public.tactic_share_links link
     set revoked_at = coalesce(link.revoked_at, v_observed_at)
   where link.guild_id = p_guild_id
     and link.revoked_at is null;

  update public.account_albion_tenant_links link
     set public_activity_enabled = false,
         public_activity_enabled_at = null,
         public_leaderboard_enabled = false,
         public_leaderboard_enabled_at = null
   where link.guild_id = p_guild_id
     and (
       link.public_activity_enabled = true
       or link.public_leaderboard_enabled = true
     );

  update public.event_participation_notification_outbox outbox
     set status = 'skipped',
         locked_at = null,
         last_error = 'tenant_suspended'
   where outbox.guild_id = p_guild_id
     and outbox.status in ('pending', 'processing', 'failed');

  perform public.revoke_tenant_session(p_guild_id, '*');
  return true;
end;
$$;

revoke all on function public.suspend_tenant_for_bot_removal(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.suspend_tenant_for_bot_removal(uuid, timestamptz)
  to service_role;

create or replace function public.tenant_deletion_obligations(
  p_guild_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_point_escrows integer;
  v_member_trade_orders integer;
  v_member_trade_offers integer;
  v_shop_orders integer;
  v_exchange_requests integer;
  v_donation_requests integer;
  v_regear_requests integer;
  v_craft_tasks integer;
  v_craft_orders integer;
  v_event_payouts integer;
  v_total integer;
begin
  select count(*)::integer into v_point_escrows
    from public.point_escrows row
   where row.guild_id = p_guild_id and row.status = 'held';
  select count(*)::integer into v_member_trade_orders
    from public.member_trade_orders row
   where row.guild_id = p_guild_id
     and row.status in ('awaiting_delivery', 'delivered', 'disputed');
  select count(*)::integer into v_member_trade_offers
    from public.member_trade_price_offers row
   where row.guild_id = p_guild_id and row.status = 'pending';
  select count(*)::integer into v_shop_orders
    from public.shop_orders row
   where row.guild_id = p_guild_id and row.status = 'pending';
  select count(*)::integer into v_exchange_requests
    from public.exchange_requests row
   where row.guild_id = p_guild_id and row.status = 'pending';
  select count(*)::integer into v_donation_requests
    from public.donation_requests row
   where row.guild_id = p_guild_id and row.status = 'pending';
  select count(*)::integer into v_regear_requests
    from public.regear_requests row
   where row.guild_id = p_guild_id and row.status = 'pending';
  select count(*)::integer into v_craft_tasks
    from public.craft_tasks row
   where row.guild_id = p_guild_id
     and (
       row.status in ('queued', 'claimed', 'delivered')
       or row.reimbursement_status = 'pending'
     );
  select count(*)::integer into v_craft_orders
    from public.craft_orders row
   where row.guild_id = p_guild_id and row.status = 'open';
  select count(*)::integer into v_event_payouts
    from public.event_payout_requests row
   where row.guild_id = p_guild_id and row.status = 'pending';

  v_total :=
    v_point_escrows
    + v_member_trade_orders
    + v_member_trade_offers
    + v_shop_orders
    + v_exchange_requests
    + v_donation_requests
    + v_regear_requests
    + v_craft_tasks
    + v_craft_orders
    + v_event_payouts;

  return jsonb_build_object(
    'total', v_total,
    'items', jsonb_build_array(
      jsonb_build_object(
        'key', 'point_escrows',
        'count', v_point_escrows,
        'path', '/admin/dashboard/market'
      ),
      jsonb_build_object(
        'key', 'member_trade_orders',
        'count', v_member_trade_orders,
        'path', '/admin/dashboard/market'
      ),
      jsonb_build_object(
        'key', 'member_trade_offers',
        'count', v_member_trade_offers,
        'path', '/admin/dashboard/market'
      ),
      jsonb_build_object(
        'key', 'shop_orders',
        'count', v_shop_orders,
        'path', '/admin/dashboard/shop'
      ),
      jsonb_build_object(
        'key', 'exchange_requests',
        'count', v_exchange_requests,
        'path', '/admin/dashboard/exchanges'
      ),
      jsonb_build_object(
        'key', 'donation_requests',
        'count', v_donation_requests,
        'path', '/admin/dashboard/donations'
      ),
      jsonb_build_object(
        'key', 'regear_requests',
        'count', v_regear_requests,
        'path', '/admin/dashboard/regear'
      ),
      jsonb_build_object(
        'key', 'craft_tasks',
        'count', v_craft_tasks,
        'path', '/admin/dashboard/craft'
      ),
      jsonb_build_object(
        'key', 'craft_orders',
        'count', v_craft_orders,
        'path', '/admin/dashboard/craft'
      ),
      jsonb_build_object(
        'key', 'event_payouts',
        'count', v_event_payouts,
        'path', '/admin/dashboard/events'
      )
    )
  );
end;
$$;

revoke all on function public.tenant_deletion_obligations(uuid)
  from public, anon, authenticated;
grant execute on function public.tenant_deletion_obligations(uuid)
  to service_role;

create or replace function public.request_tenant_deletion(
  p_guild_id uuid,
  p_actor_discord_id text,
  p_actor_authenticated_at timestamptz,
  p_expected_guild_name text,
  p_confirm_irreversible boolean,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_existing public.tenant_deletion_requests%rowtype;
  v_obligations jsonb;
  v_request_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_purge_at timestamptz;
begin
  select tenant.*
    into v_tenant
    from public.tenants tenant
   where tenant.id = p_guild_id
   for update;

  if v_tenant.id is null then raise exception 'TENANT_NOT_FOUND'; end if;
  if v_tenant.status = 'deleted' then raise exception 'TENANT_DELETED'; end if;
  if nullif(btrim(coalesce(p_actor_discord_id, '')), '') is null then
    raise exception 'WORKSPACE_DELETE_ACTOR_REQUIRED';
  end if;
  if p_actor_authenticated_at is null
     or p_actor_authenticated_at < v_now - interval '10 minutes'
     or p_actor_authenticated_at > v_now + interval '1 minute' then
    raise exception 'WORKSPACE_DELETE_REAUTH_REQUIRED';
  end if;
  if p_expected_guild_name is distinct from v_tenant.name then
    raise exception 'WORKSPACE_DELETE_NAME_MISMATCH';
  end if;
  if p_confirm_irreversible is distinct from true then
    raise exception 'WORKSPACE_DELETE_CONFIRMATION_REQUIRED';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'WORKSPACE_DELETE_REASON_TOO_LONG';
  end if;

  if v_tenant.status = 'deletion_pending' then
    select request.*
      into v_existing
      from public.tenant_deletion_requests request
     where request.guild_id = p_guild_id
       and request.status in ('pending', 'purging')
     order by request.requested_at desc
     limit 1;
    if v_existing.id is null then
      raise exception 'WORKSPACE_DELETE_STATE_INCONSISTENT';
    end if;
    return jsonb_build_object(
      'request_id', v_existing.id,
      'purge_at', v_existing.purge_at,
      'obligations', v_existing.obligation_snapshot,
      'idempotent', true
    );
  end if;
  if v_tenant.status not in ('pending', 'active', 'suspended') then
    raise exception 'WORKSPACE_DELETE_NOT_REQUESTABLE';
  end if;

  v_obligations := public.tenant_deletion_obligations(p_guild_id);
  if coalesce((v_obligations ->> 'total')::integer, 0) > 0 then
    raise exception 'WORKSPACE_DELETE_BLOCKED_OPEN_OBLIGATIONS';
  end if;

  v_purge_at := v_now + interval '30 days';

  insert into public.tenant_deletion_requests (
    id,
    guild_id,
    tenant_fingerprint,
    tenant_name_snapshot,
    tenant_slug_snapshot,
    requested_by,
    request_reason,
    status,
    obligation_snapshot,
    requested_at,
    purge_at
  ) values (
    v_request_id,
    p_guild_id,
    encode(extensions.digest(v_tenant.discord_guild_id, 'sha256'), 'hex'),
    v_tenant.name,
    v_tenant.slug,
    p_actor_discord_id,
    nullif(btrim(coalesce(p_reason, '')), ''),
    'pending',
    v_obligations,
    v_now,
    v_purge_at
  );

  update public.tenants tenant
     set status = 'deletion_pending',
         lifecycle_reason = 'deletion_requested',
         lifecycle_changed_at = v_now,
         lifecycle_changed_by = p_actor_discord_id,
         deletion_requested_at = v_now,
         purge_at = v_purge_at
   where tenant.id = p_guild_id;

  update public.event_guest_tokens token
     set revoked_at = coalesce(token.revoked_at, v_now)
   where token.guild_id = p_guild_id
     and token.revoked_at is null;
  update public.tactic_share_links link
     set revoked_at = coalesce(link.revoked_at, v_now)
   where link.guild_id = p_guild_id
     and link.revoked_at is null;
  update public.account_albion_tenant_links link
     set public_activity_enabled = false,
         public_activity_enabled_at = null,
         public_leaderboard_enabled = false,
         public_leaderboard_enabled_at = null
   where link.guild_id = p_guild_id
     and (
       link.public_activity_enabled = true
       or link.public_leaderboard_enabled = true
     );
  update public.event_participation_notification_outbox outbox
     set status = 'skipped',
         locked_at = null,
         last_error = 'tenant_deletion_pending'
   where outbox.guild_id = p_guild_id
     and outbox.status in ('pending', 'processing', 'failed');
  update public.app_settings setting
     set value = '',
         updated_at = v_now
   where setting.guild_id = p_guild_id
     and setting.key = 'local_guild_invite_hash';

  perform public.revoke_tenant_session(p_guild_id, '*');

  return jsonb_build_object(
    'request_id', v_request_id,
    'purge_at', v_purge_at,
    'obligations', v_obligations,
    'idempotent', false
  );
end;
$$;

revoke all on function public.request_tenant_deletion(
  uuid, text, timestamptz, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.request_tenant_deletion(
  uuid, text, timestamptz, text, boolean, text
) to service_role;

create or replace function public.cancel_tenant_deletion(
  p_request_id uuid,
  p_actor_discord_id text,
  p_actor_authenticated_at timestamptz,
  p_expected_guild_name text,
  p_confirm_restore boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.tenant_deletion_requests%rowtype;
  v_tenant public.tenants%rowtype;
  v_now timestamptz := clock_timestamp();
  v_blocker text;
  v_next_status text;
begin
  select request.*
    into v_request
    from public.tenant_deletion_requests request
   where request.id = p_request_id
   for update;

  if v_request.id is null or v_request.guild_id is null then
    raise exception 'WORKSPACE_DELETE_REQUEST_NOT_FOUND';
  end if;
  if v_request.status = 'cancelled' then
    return jsonb_build_object(
      'status', 'cancelled',
      'tenant_status', null,
      'idempotent', true
    );
  end if;
  if v_request.status <> 'pending' then
    raise exception 'WORKSPACE_DELETE_CANCELLATION_UNAVAILABLE';
  end if;
  if v_now >= v_request.purge_at then
    raise exception 'WORKSPACE_DELETE_CANCELLATION_EXPIRED';
  end if;

  select tenant.*
    into v_tenant
    from public.tenants tenant
   where tenant.id = v_request.guild_id
   for update;

  if v_tenant.id is null or v_tenant.status <> 'deletion_pending' then
    raise exception 'WORKSPACE_DELETE_STATE_INCONSISTENT';
  end if;
  if nullif(btrim(coalesce(p_actor_discord_id, '')), '') is null then
    raise exception 'WORKSPACE_DELETE_ACTOR_REQUIRED';
  end if;
  if p_actor_authenticated_at is null
     or p_actor_authenticated_at < v_now - interval '10 minutes'
     or p_actor_authenticated_at > v_now + interval '1 minute' then
    raise exception 'WORKSPACE_DELETE_REAUTH_REQUIRED';
  end if;
  if p_expected_guild_name is distinct from v_tenant.name then
    raise exception 'WORKSPACE_DELETE_NAME_MISMATCH';
  end if;
  if p_confirm_restore is distinct from true then
    raise exception 'WORKSPACE_DELETE_RESTORE_CONFIRMATION_REQUIRED';
  end if;

  v_blocker := public.tenant_activation_blocker(v_tenant.id);
  v_next_status := case when v_blocker is null then 'active' else 'suspended' end;

  update public.tenant_deletion_requests request
     set status = 'cancelled',
         cancelled_at = v_now,
         cancelled_by = p_actor_discord_id,
         purge_claim_token = null,
         purge_started_at = null,
         purge_last_error = null
   where request.id = p_request_id;

  update public.tenants tenant
     set status = v_next_status,
         lifecycle_reason = case
           when v_next_status = 'active' then null
           else 'configuration_incomplete'
         end,
         lifecycle_changed_at = v_now,
         lifecycle_changed_by = p_actor_discord_id,
         deletion_requested_at = null,
         purge_at = null
   where tenant.id = v_tenant.id;

  return jsonb_build_object(
    'status', 'cancelled',
    'tenant_status', v_next_status,
    'tenant_slug', v_tenant.slug,
    'activation_blocker', v_blocker,
    'idempotent', false
  );
end;
$$;

revoke all on function public.cancel_tenant_deletion(
  uuid, text, timestamptz, text, boolean
) from public, anon, authenticated;
grant execute on function public.cancel_tenant_deletion(
  uuid, text, timestamptz, text, boolean
) to service_role;

create or replace function public.claim_due_tenant_deletions(
  p_limit integer default 5
) returns table (
  request_id uuid,
  guild_id uuid,
  claim_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_obligations jsonb;
  v_claim_token uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'INVALID_PURGE_CLAIM_LIMIT';
  end if;

  for v_candidate in
    select request.id, request.guild_id
      from public.tenant_deletion_requests request
      join public.tenants tenant on tenant.id = request.guild_id
     where tenant.status = 'deletion_pending'
       and request.purge_at <= clock_timestamp()
       and (
         request.status = 'pending'
         or (
           request.status = 'purging'
           and request.purge_started_at < clock_timestamp() - interval '30 minutes'
         )
       )
     order by request.purge_at, request.id
     for update of request skip locked
     limit p_limit
  loop
    v_obligations := public.tenant_deletion_obligations(v_candidate.guild_id);
    if coalesce((v_obligations ->> 'total')::integer, 0) > 0 then
      update public.tenant_deletion_requests request
         set purge_last_error = 'open_obligations'
       where request.id = v_candidate.id;
      continue;
    end if;

    v_claim_token := gen_random_uuid();
    update public.tenant_deletion_requests request
       set status = 'purging',
           purge_started_at = clock_timestamp(),
           purge_claim_token = v_claim_token,
           purge_attempts = request.purge_attempts + 1,
           purge_last_error = null
     where request.id = v_candidate.id;

    request_id := v_candidate.id;
    guild_id := v_candidate.guild_id;
    claim_token := v_claim_token;
    return next;
  end loop;
end;
$$;

revoke all on function public.claim_due_tenant_deletions(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_tenant_deletions(integer)
  to service_role;

create or replace function public.release_tenant_deletion_claim(
  p_request_id uuid,
  p_claim_token uuid,
  p_error text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenant_deletion_requests request
     set status = 'pending',
         purge_started_at = null,
         purge_claim_token = null,
         purge_last_error = left(
           coalesce(nullif(btrim(p_error), ''), 'purge_worker_failed'),
           1000
         )
   where request.id = p_request_id
     and request.status = 'purging'
     and request.purge_claim_token = p_claim_token;
  return found;
end;
$$;

revoke all on function public.release_tenant_deletion_claim(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_tenant_deletion_claim(uuid, uuid, text)
  to service_role;

-- During a tenant CASCADE delete, subject-row triggers must not attempt to
-- create a new revocation row beneath the parent that is being removed. A
-- deletion-pending tenant is already globally revoked, so skipping those
-- trigger writes is both safe and required for an atomic tenant purge.
create or replace function public.capture_tenant_session_revocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild_id uuid;
  v_subject text := '*';
  v_key text;
  v_status text;
begin
  if tg_table_name = 'tenant_admin_overrides' then
    if tg_op = 'DELETE' then v_guild_id := old.tenant_id; else v_guild_id := new.tenant_id; end if;
  elsif tg_table_name = 'permission_role_grants' then
    if tg_op = 'DELETE' then v_guild_id := old.guild_id; else v_guild_id := new.guild_id; end if;
  elsif tg_table_name = 'permission_user_overrides' then
    if tg_op = 'DELETE' then
      v_guild_id := old.guild_id;
      v_subject := old.discord_id;
    else
      v_guild_id := new.guild_id;
      v_subject := new.discord_id;
    end if;
  elsif tg_table_name = 'tenants' then
    v_guild_id := new.id;
  elsif tg_table_name = 'app_settings' then
    if tg_op = 'DELETE' then v_key := old.key; else v_key := new.key; end if;
    if v_key not in (
      'active_member_role_ids',
      'bomb_squad_caller_role_ids',
      'event_creator_role_ids',
      'event_creator_role_ids_combat',
      'event_creator_role_ids_ff',
      'event_creator_role_ids_ganking'
    ) then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    if tg_op = 'DELETE' then v_guild_id := old.guild_id; else v_guild_id := new.guild_id; end if;
  elsif tg_table_name = 'guild_avatars' then
    if tg_op = 'DELETE' then
      v_guild_id := old.guild_id;
      v_subject := old.discord_id;
    else
      v_guild_id := new.guild_id;
      v_subject := new.discord_id;
    end if;
  elsif tg_table_name = 'guild_local_accounts' then
    if tg_op = 'DELETE' then
      v_guild_id := old.guild_id;
      v_subject := old.subject;
    else
      v_guild_id := new.guild_id;
      v_subject := new.subject;
    end if;
  elsif tg_table_name = 'guest_revocations' then
    if tg_op = 'DELETE' then
      v_guild_id := old.guild_id;
      v_subject := old.discord_id;
    else
      v_guild_id := new.guild_id;
      v_subject := new.discord_id;
    end if;
  else
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select tenant.status
    into v_status
    from public.tenants tenant
   where tenant.id = v_guild_id;
  if v_status is null or v_status in ('deletion_pending', 'deleted') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_guild_id is not null
     and char_length(coalesce(v_subject, '')) between 1 and 128 then
    perform public.revoke_tenant_session(v_guild_id, v_subject);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_tenant_session_revocation()
  from public, anon, authenticated, service_role;

-- A deletion-pending tenant may only leave through the claimed purge protocol.
-- This prevents a direct service-role delete from orphaning an open request or
-- bypassing the storage cleanup receipt. The claim token is transaction-local
-- and is set immediately before the CASCADE by finalize_tenant_purge().
create or replace function public.guard_tenant_deletion_pending_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_text text := current_setting(
    'app.tenant_purge_claim_token',
    true
  );
begin
  if old.status <> 'deletion_pending' then
    return old;
  end if;

  if nullif(v_claim_text, '') is null
     or not exists (
       select 1
         from public.tenant_deletion_requests request
        where request.guild_id = old.id
          and request.status = 'purging'
          and request.purge_claim_token::text = v_claim_text
     ) then
    raise exception 'TENANT_DELETE_REQUIRES_PURGE_CLAIM';
  end if;

  return old;
end;
$$;

revoke all on function public.guard_tenant_deletion_pending_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists tenants_deletion_pending_delete_guard
  on public.tenants;
create trigger tenants_deletion_pending_delete_guard
  before delete on public.tenants
  for each row execute function public.guard_tenant_deletion_pending_delete();

create or replace function public.finalize_tenant_purge(
  p_request_id uuid,
  p_guild_id uuid,
  p_claim_token uuid,
  p_storage_receipt jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.tenant_deletion_requests%rowtype;
  v_tenant public.tenants%rowtype;
  v_obligations jsonb;
  v_now timestamptz := clock_timestamp();
  v_receipt jsonb;
begin
  if p_storage_receipt is null
     or jsonb_typeof(p_storage_receipt) <> 'object'
     or octet_length(p_storage_receipt::text) > 16384 then
    raise exception 'INVALID_PURGE_STORAGE_RECEIPT';
  end if;

  select request.*
    into v_request
    from public.tenant_deletion_requests request
   where request.id = p_request_id
   for update;
  if v_request.id is null
     or v_request.guild_id is distinct from p_guild_id
     or v_request.status <> 'purging'
     or v_request.purge_claim_token is distinct from p_claim_token then
    raise exception 'PURGE_CLAIM_INVALID';
  end if;
  if v_request.purge_at > v_now then raise exception 'PURGE_NOT_DUE'; end if;

  select tenant.*
    into v_tenant
    from public.tenants tenant
   where tenant.id = p_guild_id
   for update;
  if v_tenant.id is null or v_tenant.status <> 'deletion_pending' then
    raise exception 'WORKSPACE_DELETE_STATE_INCONSISTENT';
  end if;

  v_obligations := public.tenant_deletion_obligations(p_guild_id);
  if coalesce((v_obligations ->> 'total')::integer, 0) > 0 then
    raise exception 'WORKSPACE_DELETE_BLOCKED_OPEN_OBLIGATIONS';
  end if;

  v_receipt := jsonb_build_object(
    'request_id', p_request_id,
    'purged_at', v_now,
    'storage', p_storage_receipt,
    'obligations', v_obligations,
    'scope', 'tenant_only'
  );

  perform set_config(
    'app.tenant_purge_claim_token',
    p_claim_token::text,
    true
  );

  delete from public.tenants tenant
   where tenant.id = p_guild_id;

  update public.tenant_deletion_requests request
     set guild_id = null,
         requested_by = null,
         request_reason = null,
         status = 'purged',
         purge_started_at = null,
         purge_claim_token = null,
         purge_last_error = null,
         purged_at = v_now,
         purge_receipt = v_receipt
   where request.id = p_request_id;

  return v_receipt;
end;
$$;

revoke all on function public.finalize_tenant_purge(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_tenant_purge(uuid, uuid, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
