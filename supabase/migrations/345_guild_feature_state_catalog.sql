-- Release C: one tenant feature-state contract for navigation, routes,
-- commands, queues, notifications, and automation. Battlelog modules are
-- deliberately excluded because they are owned by a separate release stream.

create table if not exists public.guild_feature_states (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null,
  state text not null,
  config jsonb not null default '{}'::jsonb,
  updated_by_member_id uuid,
  updated_at timestamptz not null default now(),
  primary key (guild_id, feature_key),
  constraint guild_feature_states_key_check check (feature_key in (
    'workspace', 'events', 'members', 'member_self_service',
    'settings_and_permissions', 'operation_assets', 'tactics', 'supply',
    'guild_economy', 'guild_shop', 'member_market', 'asset_accounting',
    'insights', 'public_guild_profile'
  )),
  constraint guild_feature_states_state_check check (
    state in ('disabled', 'setup_required', 'enabled', 'draining')
  ),
  constraint guild_feature_states_config_check check (
    jsonb_typeof(config) = 'object'
  ),
  constraint guild_feature_states_actor_fkey
    foreign key (guild_id, updated_by_member_id)
    references public.guild_member_records(guild_id, id)
    on delete set null (updated_by_member_id)
);

create index if not exists guild_feature_states_state_idx
  on public.guild_feature_states (guild_id, state, feature_key);

create table if not exists public.guild_feature_state_events (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null,
  from_state text,
  to_state text not null,
  from_config jsonb not null default '{}'::jsonb,
  to_config jsonb not null default '{}'::jsonb,
  actor_member_id uuid,
  actor_discord_id text,
  source text not null check (source in (
    'operator_command', 'legacy_setting_sync', 'tenant_initialize',
    'existing_tenant_backfill', 'draining_complete'
  )),
  created_at timestamptz not null default now(),
  constraint guild_feature_state_events_key_check check (feature_key in (
    'workspace', 'events', 'members', 'member_self_service',
    'settings_and_permissions', 'operation_assets', 'tactics', 'supply',
    'guild_economy', 'guild_shop', 'member_market', 'asset_accounting',
    'insights', 'public_guild_profile'
  )),
  constraint guild_feature_state_events_from_state_check check (
    from_state is null or from_state in (
      'disabled', 'setup_required', 'enabled', 'draining'
    )
  ),
  constraint guild_feature_state_events_to_state_check check (
    to_state in ('disabled', 'setup_required', 'enabled', 'draining')
  ),
  constraint guild_feature_state_events_actor_fkey
    foreign key (guild_id, actor_member_id)
    references public.guild_member_records(guild_id, id)
    on delete set null (actor_member_id)
);

create index if not exists guild_feature_state_events_recent_idx
  on public.guild_feature_state_events (guild_id, created_at desc);

alter table public.guild_feature_states enable row level security;
alter table public.guild_feature_state_events enable row level security;
revoke all on table public.guild_feature_states
  from public, anon, authenticated, service_role;
revoke all on table public.guild_feature_state_events
  from public, anon, authenticated, service_role;
grant select on table public.guild_feature_states to service_role;
grant select on table public.guild_feature_state_events to service_role;

create or replace function public.guild_feature_has_open_work(
  p_guild_id uuid,
  p_feature_key text
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_feature_key = 'supply' then
    return exists (
      select 1 from public.regear_requests row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.craft_tasks row
       where row.guild_id = p_guild_id
         and row.status in ('queued', 'claimed', 'delivered')
    ) or exists (
      select 1 from public.craft_orders row
       where row.guild_id = p_guild_id and row.status = 'open'
    ) or exists (
      select 1 from public.supply_fulfillments row
       where row.guild_id = p_guild_id
         and row.status in (
           'awaiting_decision', 'queued', 'in_progress',
           'ready_for_pickup', 'receipt_overdue'
         )
    ) or exists (
      select 1 from public.supply_settlement_items row
       where row.guild_id = p_guild_id and row.status = 'payable'
    );
  elsif p_feature_key = 'guild_economy' then
    return exists (
      select 1 from public.exchange_requests row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.donation_requests row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.event_payout_requests row
       where row.guild_id = p_guild_id and row.status = 'pending'
    );
  elsif p_feature_key = 'guild_shop' then
    return exists (
      select 1 from public.shop_orders row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.shop_order_price_reviews row
       where row.guild_id = p_guild_id
         and row.status in ('awaiting_member', 'member_confirmed')
    );
  elsif p_feature_key = 'member_market' then
    return exists (
      select 1 from public.member_trade_orders row
       where row.guild_id = p_guild_id
         and row.status in ('awaiting_delivery', 'delivered', 'disputed')
    ) or exists (
      select 1 from public.member_trade_price_offers row
       where row.guild_id = p_guild_id and row.status = 'pending'
    ) or exists (
      select 1 from public.point_escrows row
       where row.guild_id = p_guild_id
         and row.source_kind = 'member_trade_order'
         and row.status = 'held'
    );
  end if;
  return false;
end;
$$;

create or replace function public.assert_guild_feature_use(
  p_guild_id uuid,
  p_feature_key text,
  p_use text
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_state text;
begin
  if p_use not in ('setup', 'read', 'intake', 'process', 'notify', 'automate') then
    raise exception 'INVALID_FEATURE_USE';
  end if;

  select feature.state
    into v_state
    from public.guild_feature_states feature
   where feature.guild_id = p_guild_id
     and feature.feature_key = p_feature_key;

  if v_state is null then
    raise exception 'FEATURE_STATE_MISSING';
  end if;
  if v_state = 'enabled' then
    return v_state;
  end if;
  if v_state = 'setup_required' and p_use = 'setup' then
    return v_state;
  end if;
  if v_state = 'draining'
     and p_use in ('setup', 'read', 'process', 'notify') then
    return v_state;
  end if;
  raise exception 'FEATURE_USE_BLOCKED:%:%', p_feature_key, v_state;
end;
$$;

create or replace function public.initialize_guild_feature_states(
  p_guild_id uuid,
  p_existing_tenant boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into public.guild_feature_states (
    guild_id,
    feature_key,
    state,
    config,
    updated_at
  )
  select
    p_guild_id,
    seed.feature_key,
    case
      when seed.always_enabled then 'enabled'
      when p_existing_tenant and seed.feature_key in (
        'operation_assets', 'guild_economy', 'guild_shop',
        'member_market', 'asset_accounting', 'insights'
      ) then 'enabled'
      when seed.feature_key = 'supply' then case
        when exists (
          select 1 from public.app_settings setting
           where setting.guild_id = p_guild_id
             and setting.key in (
               'regear_support_enabled', 'craft_regear_enabled'
             )
             and setting.value = 'true'
        ) then 'enabled'
        when exists (
          select 1 from public.app_settings setting
           where setting.guild_id = p_guild_id
             and setting.key = 'regear_support_enabled'
             and setting.value = 'false'
        ) then 'disabled'
        else 'setup_required'
      end
      when seed.feature_key = 'tactics' then case when exists (
        select 1 from public.app_settings setting
         where setting.guild_id = p_guild_id
           and setting.key = 'tactics_experimental_enabled'
           and setting.value = 'true'
      ) then 'enabled' else 'disabled' end
      when seed.feature_key = 'public_guild_profile' then case when exists (
        select 1 from public.app_settings setting
         where setting.guild_id = p_guild_id
           and setting.key = 'guild_profile_enabled'
           and setting.value = 'true'
      ) then 'enabled' else 'disabled' end
      else 'disabled'
    end,
    case when seed.feature_key = 'supply' then jsonb_build_object(
      'mode', case when exists (
        select 1 from public.app_settings setting
         where setting.guild_id = p_guild_id
           and setting.key = 'craft_regear_enabled'
           and setting.value = 'true'
      ) then 'craft' else 'silver' end
    ) else '{}'::jsonb end,
    now()
  from (values
    ('workspace', true),
    ('events', true),
    ('members', true),
    ('member_self_service', true),
    ('settings_and_permissions', true),
    ('operation_assets', false),
    ('tactics', false),
    ('supply', false),
    ('guild_economy', false),
    ('guild_shop', false),
    ('member_market', false),
    ('asset_accounting', false),
    ('insights', false),
    ('public_guild_profile', false)
  ) as seed(feature_key, always_enabled)
  on conflict (guild_id, feature_key) do nothing;
  get diagnostics v_count = row_count;

  insert into public.guild_feature_state_events (
    guild_id,
    feature_key,
    from_state,
    to_state,
    from_config,
    to_config,
    source
  )
  select
    feature.guild_id,
    feature.feature_key,
    null,
    feature.state,
    '{}'::jsonb,
    feature.config,
    case when p_existing_tenant
      then 'existing_tenant_backfill'
      else 'tenant_initialize'
    end
  from public.guild_feature_states feature
  where feature.guild_id = p_guild_id
    and feature.updated_at >= transaction_timestamp()
  on conflict do nothing;

  return v_count;
end;
$$;

create or replace function public.initialize_guild_feature_states_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.initialize_guild_feature_states(new.id, false);
  return new;
end;
$$;

drop trigger if exists tenants_initialize_guild_feature_states
  on public.tenants;
create trigger tenants_initialize_guild_feature_states
after insert on public.tenants
for each row execute function public.initialize_guild_feature_states_trigger();

select public.initialize_guild_feature_states(tenant.id, true)
  from public.tenants tenant;

create or replace function public.sync_legacy_setting_to_guild_feature_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature_key text;
  v_previous public.guild_feature_states%rowtype;
  v_state text;
  v_config jsonb := '{}'::jsonb;
  v_mode text;
begin
  if new.key in ('regear_support_enabled', 'craft_regear_enabled') then
    v_feature_key := 'supply';
    select case setting.value when 'true' then 'craft' else 'silver' end
      into v_mode
      from public.app_settings setting
     where setting.guild_id = new.guild_id
       and setting.key = 'craft_regear_enabled';
    if new.key = 'craft_regear_enabled' then
      v_mode := case new.value when 'true' then 'craft' else 'silver' end;
    end if;
    v_config := jsonb_build_object('mode', coalesce(v_mode, 'silver'));
    if new.key = 'regear_support_enabled' then
      if new.value = 'true' then
        v_state := 'enabled';
      elsif public.guild_feature_has_open_work(new.guild_id, v_feature_key) then
        v_state := 'draining';
      else
        v_state := 'disabled';
      end if;
    else
      select feature.state into v_state
        from public.guild_feature_states feature
       where feature.guild_id = new.guild_id
         and feature.feature_key = v_feature_key;
      v_state := coalesce(v_state, 'setup_required');
    end if;
  elsif new.key = 'tactics_experimental_enabled' then
    v_feature_key := 'tactics';
    v_state := case when new.value = 'true' then 'enabled' else 'disabled' end;
  elsif new.key = 'guild_profile_enabled' then
    v_feature_key := 'public_guild_profile';
    v_state := case when new.value = 'true' then 'enabled' else 'disabled' end;
  else
    return new;
  end if;

  select * into v_previous
    from public.guild_feature_states feature
   where feature.guild_id = new.guild_id
     and feature.feature_key = v_feature_key;

  insert into public.guild_feature_states (
    guild_id, feature_key, state, config, updated_at
  ) values (
    new.guild_id, v_feature_key, v_state, v_config, now()
  )
  on conflict (guild_id, feature_key) do update
    set state = excluded.state,
        config = case
          when excluded.feature_key = 'supply' then excluded.config
          else public.guild_feature_states.config
        end,
        updated_at = case
          when public.guild_feature_states.state is distinct from excluded.state
            or public.guild_feature_states.config is distinct from (
              case when excluded.feature_key = 'supply'
                then excluded.config
                else public.guild_feature_states.config
              end
            )
          then now()
          else public.guild_feature_states.updated_at
        end;

  if v_previous.feature_key is null
     or v_previous.state is distinct from v_state
     or (v_feature_key = 'supply' and v_previous.config is distinct from v_config) then
    insert into public.guild_feature_state_events (
      guild_id, feature_key, from_state, to_state,
      from_config, to_config, source
    ) values (
      new.guild_id,
      v_feature_key,
      v_previous.state,
      v_state,
      coalesce(v_previous.config, '{}'::jsonb),
      v_config,
      'legacy_setting_sync'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists app_settings_sync_guild_feature_state
  on public.app_settings;
create trigger app_settings_sync_guild_feature_state
after insert or update of value on public.app_settings
for each row
when (new.key in (
  'regear_support_enabled', 'craft_regear_enabled',
  'tactics_experimental_enabled', 'guild_profile_enabled'
))
execute function public.sync_legacy_setting_to_guild_feature_state();

create or replace function public.change_guild_feature_state(
  p_guild_id uuid,
  p_feature_key text,
  p_target_state text,
  p_config jsonb,
  p_actor_discord_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.guild_feature_states%rowtype;
  v_next_state text;
  v_next_config jsonb := coalesce(p_config, '{}'::jsonb);
  v_actor text := btrim(coalesce(p_actor_discord_id, ''));
  v_actor_member_id uuid;
begin
  if p_feature_key not in (
    'operation_assets', 'tactics', 'supply', 'guild_economy',
    'guild_shop', 'member_market', 'asset_accounting', 'insights',
    'public_guild_profile'
  ) then
    raise exception 'FEATURE_NOT_CONFIGURABLE';
  end if;
  if p_target_state not in ('disabled', 'setup_required', 'enabled') then
    raise exception 'INVALID_FEATURE_TARGET_STATE';
  end if;
  if jsonb_typeof(v_next_config) <> 'object' then
    raise exception 'INVALID_FEATURE_CONFIG';
  end if;
  if v_actor = '' or char_length(v_actor) > 128 then
    raise exception 'FEATURE_ACTOR_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':feature:' || p_feature_key, 0)
  );
  select * into v_current
    from public.guild_feature_states feature
   where feature.guild_id = p_guild_id
     and feature.feature_key = p_feature_key
   for update;
  if v_current.feature_key is null then
    raise exception 'FEATURE_STATE_MISSING';
  end if;

  if p_target_state = 'enabled'
     and p_feature_key in ('guild_shop', 'member_market')
     and not exists (
       select 1 from public.guild_feature_states economy
        where economy.guild_id = p_guild_id
          and economy.feature_key = 'guild_economy'
          and economy.state = 'enabled'
     ) then
    raise exception 'FEATURE_DEPENDENCY_REQUIRED:guild_economy';
  end if;

  if p_target_state = 'disabled'
     and p_feature_key = 'guild_economy'
     and exists (
       select 1 from public.guild_feature_states dependent
        where dependent.guild_id = p_guild_id
          and dependent.feature_key in ('guild_shop', 'member_market')
          and dependent.state <> 'disabled'
     ) then
    raise exception 'FEATURE_DEPENDENTS_ACTIVE';
  end if;

  if p_feature_key = 'supply' and p_target_state = 'enabled' then
    if v_next_config ->> 'mode' not in ('silver', 'craft') then
      raise exception 'SUPPLY_MODE_REQUIRED';
    end if;
  elsif p_feature_key = 'supply' then
    v_next_config := v_current.config;
  elsif p_feature_key <> 'supply' then
    v_next_config := v_current.config;
  end if;

  if p_target_state = 'disabled'
     and public.guild_feature_has_open_work(p_guild_id, p_feature_key) then
    v_next_state := 'draining';
  else
    v_next_state := p_target_state;
  end if;

  v_actor_member_id := public.resolve_guild_member_id(
    p_guild_id, 'discord', v_actor
  );

  update public.guild_feature_states
     set state = v_next_state,
         config = v_next_config,
         updated_by_member_id = v_actor_member_id,
         updated_at = now()
   where guild_id = p_guild_id
     and feature_key = p_feature_key;

  if v_current.state is distinct from v_next_state
     or v_current.config is distinct from v_next_config then
    insert into public.guild_feature_state_events (
      guild_id, feature_key, from_state, to_state,
      from_config, to_config, actor_member_id, actor_discord_id, source
    ) values (
      p_guild_id, p_feature_key, v_current.state, v_next_state,
      v_current.config, v_next_config, v_actor_member_id, v_actor,
      'operator_command'
    );
  end if;

  if p_feature_key = 'supply' then
    insert into public.app_settings (guild_id, key, value, updated_at)
    values (
      p_guild_id,
      'regear_support_enabled',
      case when v_next_state in ('enabled', 'draining') then 'true' else 'false' end,
      now()
    )
    on conflict (guild_id, key) do update
      set value = excluded.value, updated_at = excluded.updated_at;
    if v_next_state = 'enabled' then
      insert into public.app_settings (guild_id, key, value, updated_at)
      values (
        p_guild_id,
        'craft_regear_enabled',
        case when v_next_config ->> 'mode' = 'craft' then 'true' else 'false' end,
        now()
      )
      on conflict (guild_id, key) do update
        set value = excluded.value, updated_at = excluded.updated_at;
    end if;
  elsif p_feature_key = 'tactics' then
    insert into public.app_settings (guild_id, key, value, updated_at)
    values (
      p_guild_id, 'tactics_experimental_enabled',
      case when v_next_state = 'enabled' then 'true' else 'false' end, now()
    )
    on conflict (guild_id, key) do update
      set value = excluded.value, updated_at = excluded.updated_at;
  elsif p_feature_key = 'public_guild_profile' then
    insert into public.app_settings (guild_id, key, value, updated_at)
    values (
      p_guild_id, 'guild_profile_enabled',
      case when v_next_state = 'enabled' then 'true' else 'false' end, now()
    )
    on conflict (guild_id, key) do update
      set value = excluded.value, updated_at = excluded.updated_at;
  end if;

  return jsonb_build_object(
    'featureKey', p_feature_key,
    'previousState', v_current.state,
    'state', v_next_state,
    'openWork', public.guild_feature_has_open_work(p_guild_id, p_feature_key)
  );
end;
$$;

create or replace function public.finalize_draining_guild_feature(
  p_guild_id uuid,
  p_feature_key text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.guild_feature_states%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':feature:' || p_feature_key, 0)
  );
  select * into v_previous
    from public.guild_feature_states feature
   where feature.guild_id = p_guild_id
     and feature.feature_key = p_feature_key
   for update;
  if v_previous.state <> 'draining'
     or public.guild_feature_has_open_work(p_guild_id, p_feature_key) then
    return false;
  end if;

  update public.guild_feature_states
     set state = 'disabled', updated_at = now()
   where guild_id = p_guild_id and feature_key = p_feature_key;
  insert into public.guild_feature_state_events (
    guild_id, feature_key, from_state, to_state,
    from_config, to_config, source
  ) values (
    p_guild_id, p_feature_key, 'draining', 'disabled',
    v_previous.config, v_previous.config, 'draining_complete'
  );

  if p_feature_key = 'supply' then
    insert into public.app_settings (guild_id, key, value, updated_at)
    values (p_guild_id, 'regear_support_enabled', 'false', now())
    on conflict (guild_id, key) do update
      set value = excluded.value, updated_at = excluded.updated_at;
  end if;
  return true;
end;
$$;

create or replace function public.guard_guild_feature_intake()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature_key text := tg_argv[0];
begin
  perform public.assert_guild_feature_use(new.guild_id, v_feature_key, 'intake');
  return new;
end;
$$;

create or replace function public.finalize_guild_feature_from_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature_key text := tg_argv[0];
  v_guild_id uuid := coalesce(new.guild_id, old.guild_id);
begin
  perform public.finalize_draining_guild_feature(v_guild_id, v_feature_key);
  return coalesce(new, old);
end;
$$;

do $$
declare
  v_rule record;
begin
  for v_rule in
    select * from (values
      ('regear_requests', 'supply'),
      ('craft_orders', 'supply'),
      ('exchange_requests', 'guild_economy'),
      ('donation_requests', 'guild_economy'),
      ('event_payout_requests', 'guild_economy'),
      ('special_reward_grants', 'guild_economy'),
      ('shop_orders', 'guild_shop'),
      ('member_trade_listings', 'member_market'),
      ('member_trade_orders', 'member_market'),
      ('member_trade_price_offers', 'member_market')
    ) as rules(table_name, feature_key)
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'guard_' || v_rule.table_name || '_feature_intake',
      v_rule.table_name
    );
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.guard_guild_feature_intake(%L)',
      'guard_' || v_rule.table_name || '_feature_intake',
      v_rule.table_name,
      v_rule.feature_key
    );
  end loop;

  for v_rule in
    select * from (values
      ('regear_requests', 'supply'),
      ('craft_tasks', 'supply'),
      ('craft_orders', 'supply'),
      ('supply_fulfillments', 'supply'),
      ('supply_settlement_items', 'supply'),
      ('exchange_requests', 'guild_economy'),
      ('donation_requests', 'guild_economy'),
      ('event_payout_requests', 'guild_economy'),
      ('shop_orders', 'guild_shop'),
      ('shop_order_price_reviews', 'guild_shop'),
      ('member_trade_orders', 'member_market'),
      ('member_trade_price_offers', 'member_market'),
      ('point_escrows', 'member_market')
    ) as rules(table_name, feature_key)
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'finalize_' || v_rule.table_name || '_feature_draining',
      v_rule.table_name
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.finalize_guild_feature_from_row(%L)',
      'finalize_' || v_rule.table_name || '_feature_draining',
      v_rule.table_name,
      v_rule.feature_key
    );
  end loop;
end
$$;

revoke all on function public.guild_feature_has_open_work(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.initialize_guild_feature_states(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.initialize_guild_feature_states_trigger()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_legacy_setting_to_guild_feature_state()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_guild_feature_intake()
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_guild_feature_from_row()
  from public, anon, authenticated, service_role;

revoke all on function public.assert_guild_feature_use(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.assert_guild_feature_use(uuid, text, text)
  to service_role;
revoke all on function public.change_guild_feature_state(
  uuid, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.change_guild_feature_state(
  uuid, text, text, jsonb, text
) to service_role;
revoke all on function public.finalize_draining_guild_feature(uuid, text)
  from public, anon, authenticated;
grant execute on function public.finalize_draining_guild_feature(uuid, text)
  to service_role;

comment on table public.guild_feature_states is
  'Tenant feature state machine. Code catalog owns meaning and adapters; this table stores state and small config only.';
comment on function public.change_guild_feature_state(
  uuid, text, text, jsonb, text
) is
  'Service-role operator command. Disabling an obligated module enters draining; dependencies and audit history are transactional.';
