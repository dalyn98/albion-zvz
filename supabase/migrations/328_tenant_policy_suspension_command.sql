-- 328: Route operator policy suspension through an explicit lifecycle command.
--
-- Pending onboarding, bot-removal suspension, delayed deletion, and the
-- irreversible purge protocol must not be bypassed by a raw status update.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.set_tenant_policy_suspension(
  p_guild_id uuid,
  p_suspended boolean,
  p_actor_discord_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_now timestamptz := clock_timestamp();
  v_blocker text;
begin
  if nullif(btrim(coalesce(p_actor_discord_id, '')), '') is null then
    raise exception 'TENANT_POLICY_ACTOR_REQUIRED';
  end if;

  select tenant.*
    into v_tenant
    from public.tenants tenant
   where tenant.id = p_guild_id
   for update;

  if v_tenant.id is null then raise exception 'TENANT_NOT_FOUND'; end if;
  if v_tenant.status in ('deletion_pending', 'deleted') then
    raise exception 'TENANT_POLICY_STATE_LOCKED';
  end if;

  if p_suspended then
    if v_tenant.status = 'suspended'
       and v_tenant.lifecycle_reason = 'policy' then
      return jsonb_build_object(
        'status', 'suspended',
        'idempotent', true
      );
    end if;
    if v_tenant.status <> 'active' then
      raise exception 'TENANT_POLICY_SUSPEND_REQUIRES_ACTIVE';
    end if;

    update public.tenants tenant
       set status = 'suspended',
           lifecycle_reason = 'policy',
           lifecycle_changed_at = v_now,
           lifecycle_changed_by = p_actor_discord_id
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
           last_error = 'tenant_policy_suspended'
     where outbox.guild_id = p_guild_id
       and outbox.status in ('pending', 'processing', 'failed');

    perform public.revoke_tenant_session(p_guild_id, '*');
    return jsonb_build_object(
      'status', 'suspended',
      'idempotent', false
    );
  end if;

  if v_tenant.status = 'active'
     and v_tenant.lifecycle_reason is null then
    return jsonb_build_object(
      'status', 'active',
      'idempotent', true
    );
  end if;
  if v_tenant.status <> 'suspended'
     or v_tenant.lifecycle_reason <> 'policy' then
    raise exception 'TENANT_POLICY_RESTORE_REQUIRES_POLICY_SUSPENSION';
  end if;

  v_blocker := public.tenant_activation_blocker(p_guild_id);
  if v_blocker is not null then
    raise exception 'TENANT_POLICY_RESTORE_BLOCKED:%', v_blocker;
  end if;

  update public.tenants tenant
     set status = 'active',
         lifecycle_reason = null,
         lifecycle_changed_at = v_now,
         lifecycle_changed_by = p_actor_discord_id,
         inactivity_warning_at = null
   where tenant.id = p_guild_id;

  return jsonb_build_object(
    'status', 'active',
    'idempotent', false
  );
end;
$$;

revoke all on function public.set_tenant_policy_suspension(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_tenant_policy_suspension(uuid, boolean, text)
  to service_role;

notify pgrst, 'reload schema';
