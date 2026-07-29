-- 311: Shared web/Discord application-command execution and short-lived
-- Discord confirmations.
--
-- The four quick actions below used to call their domain mutations directly
-- from each adapter. Discord retries or a repeated confirmation click could
-- therefore create a second transfer/order, while craft delivery side effects
-- lived outside the delivery transaction. This migration adds:
--   1) a tenant-scoped immutable execution receipt,
--   2) an actor-bound, expiring Discord confirmation token, and
--   3) one atomic dispatcher that locks the idempotency key before invoking the
--      existing domain RPCs.
--
-- The dispatcher remains service-role only. Web and Discord authorization is
-- resolved from a live identity by the shared application-command service
-- before this transaction starts; the SQL boundary revalidates tenant rows and
-- domain state.

create table if not exists public.application_command_runs (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  command_name text not null,
  idempotency_key uuid not null,
  correlation_id text not null,
  actor_discord_id text not null,
  actor_username text not null,
  source text not null,
  request_payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (guild_id, id),
  unique (guild_id, idempotency_key),
  constraint application_command_runs_command_chk check (
    command_name in (
      'point.transfer',
      'shop.order',
      'craft.deliver',
      'event.start'
    )
  ),
  constraint application_command_runs_source_chk check (
    source in ('web', 'discord')
  ),
  constraint application_command_runs_identity_chk check (
    length(btrim(correlation_id)) between 1 and 128
    and length(btrim(actor_discord_id)) between 1 and 128
    and length(btrim(actor_username)) between 1 and 128
  ),
  constraint application_command_runs_payload_chk check (
    jsonb_typeof(request_payload) = 'object'
    and octet_length(request_payload::text) <= 131072
    and jsonb_typeof(result) = 'object'
    and octet_length(result::text) <= 131072
  )
);

create index if not exists application_command_runs_recent_idx
  on public.application_command_runs (guild_id, command_name, created_at desc);

create table if not exists public.application_command_confirmations (
  token uuid primary key,
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_guild_id text not null,
  source_interaction_id text not null,
  command_name text not null,
  idempotency_key uuid not null,
  correlation_id text not null,
  actor_discord_id text not null,
  request_payload jsonb not null,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (guild_id, token),
  unique (guild_id, idempotency_key),
  unique (guild_id, source_interaction_id, command_name),
  constraint application_command_confirmations_command_chk check (
    command_name in (
      'point.transfer',
      'shop.order',
      'craft.deliver',
      'event.start'
    )
  ),
  constraint application_command_confirmations_identity_chk check (
    length(btrim(discord_guild_id)) between 5 and 30
    and length(btrim(source_interaction_id)) between 5 and 30
    and length(btrim(correlation_id)) between 1 and 128
    and length(btrim(actor_discord_id)) between 5 and 30
  ),
  constraint application_command_confirmations_payload_chk check (
    jsonb_typeof(request_payload) = 'object'
    and octet_length(request_payload::text) <= 131072
  ),
  constraint application_command_confirmations_expiry_chk check (
    expires_at > created_at
    and expires_at <= created_at + interval '15 minutes'
  ),
  constraint application_command_confirmations_terminal_chk check (
    confirmed_at is null or cancelled_at is null
  )
);

create index if not exists application_command_confirmations_lookup_idx
  on public.application_command_confirmations
  (guild_id, actor_discord_id, expires_at desc);

create index if not exists application_command_confirmations_expired_idx
  on public.application_command_confirmations (expires_at);

alter table public.application_command_runs enable row level security;
alter table public.application_command_confirmations enable row level security;

revoke all on public.application_command_runs,
  public.application_command_confirmations
  from public, anon, authenticated;
revoke update, delete, truncate, references, trigger
  on public.application_command_runs
  from service_role;
grant select, insert on public.application_command_runs to service_role;
grant select, insert, update, delete
  on public.application_command_confirmations
  to service_role;

create or replace function public.execute_application_command(
  p_guild_id uuid,
  p_command_name text,
  p_idempotency_key uuid,
  p_correlation_id text,
  p_actor_discord_id text,
  p_actor_username text,
  p_source text,
  p_request_payload jsonb,
  p_execution_payload jsonb default '{}'::jsonb,
  p_confirmation_token uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing public.application_command_runs%rowtype;
  v_result jsonb;
  v_ref_id uuid;
  v_order_id uuid;
  v_event_id uuid;
  v_task_id uuid;
  v_box_number integer;
  v_material_cost integer;
  v_expiry_days integer;
  v_total integer;
  v_recipient_count integer;
  v_event_title text;
  v_event_status text;
  v_event_started_at timestamptz;
  v_domain_result jsonb;
  v_build_snapshot jsonb;
  v_included_slots jsonb;
  v_requester_discord_id text;
  v_requester_username text;
  v_event_title_snapshot text;
  v_slot text;
  v_item_id text;
  v_base_item_id text;
  v_base_suffix text;
  v_stock integer;
  v_warned_item_ids jsonb := '[]'::jsonb;
  v_inventory_warned boolean := false;
  v_reimbursement_silver integer;
  v_reimbursement_status text;
  v_confirmation public.application_command_confirmations%rowtype;
begin
  if p_guild_id is null
     or p_idempotency_key is null
     or p_command_name not in (
       'point.transfer',
       'shop.order',
       'craft.deliver',
       'event.start'
     )
     or p_source not in ('web', 'discord')
     or (p_source = 'discord' and p_confirmation_token is null)
     or (p_source = 'web' and p_confirmation_token is not null)
     or nullif(btrim(p_correlation_id), '') is null
     or char_length(p_correlation_id) > 128
     or nullif(btrim(p_actor_discord_id), '') is null
     or char_length(p_actor_discord_id) > 128
     or nullif(btrim(p_actor_username), '') is null
     or char_length(p_actor_username) > 128
     or p_request_payload is null
     or jsonb_typeof(p_request_payload) <> 'object'
     or octet_length(p_request_payload::text) > 131072
     or p_execution_payload is null
     or jsonb_typeof(p_execution_payload) <> 'object' then
    raise exception 'application_command_invalid';
  end if;

  -- Serializes concurrent retries before any domain mutation. A losing request
  -- observes and returns the receipt written by the winner.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_guild_id::text || ':application-command:' || p_idempotency_key::text,
      0
    )
  );

  if p_confirmation_token is not null then
    select confirmation.*
      into v_confirmation
      from public.application_command_confirmations as confirmation
     where confirmation.token = p_confirmation_token
     for update;

    if v_confirmation.token is null
       or v_confirmation.guild_id is distinct from p_guild_id
       or v_confirmation.command_name is distinct from p_command_name
       or v_confirmation.idempotency_key is distinct from p_idempotency_key
       or v_confirmation.actor_discord_id is distinct from p_actor_discord_id
       or v_confirmation.request_payload is distinct from p_request_payload then
      raise exception 'application_command_confirmation_invalid';
    end if;
    if v_confirmation.cancelled_at is not null then
      raise exception 'application_command_confirmation_cancelled';
    end if;
    if v_confirmation.confirmed_at is null
       and v_confirmation.expires_at <= now() then
      raise exception 'application_command_confirmation_expired';
    end if;

    update public.application_command_confirmations
       set confirmed_at = coalesce(confirmed_at, now())
     where token = p_confirmation_token;
  end if;

  select run.*
    into v_existing
    from public.application_command_runs as run
   where run.guild_id = p_guild_id
     and run.idempotency_key = p_idempotency_key;

  if v_existing.id is not null then
    if v_existing.command_name is distinct from p_command_name
       or v_existing.actor_discord_id is distinct from p_actor_discord_id
       or v_existing.source is distinct from p_source
       or v_existing.request_payload is distinct from p_request_payload then
      raise exception 'application_command_idempotency_conflict';
    end if;
    return v_existing.result || jsonb_build_object('replayed', true);
  end if;

  if p_command_name = 'point.transfer' then
    if jsonb_typeof(p_request_payload -> 'transfers') <> 'array'
       or jsonb_array_length(p_request_payload -> 'transfers') < 1
       or jsonb_array_length(p_request_payload -> 'transfers') > 50
       or jsonb_typeof(p_execution_payload -> 'transfers') <> 'array'
       or jsonb_array_length(p_execution_payload -> 'transfers')
         <> jsonb_array_length(p_request_payload -> 'transfers') then
      raise exception 'application_command_transfer_invalid';
    end if;

    perform 1
      from public.guild_avatars as avatar
     where avatar.guild_id = p_guild_id
       and (
         avatar.discord_id = p_actor_discord_id
         or avatar.discord_id in (
           select entry ->> 'discord_id'
             from jsonb_array_elements(p_execution_payload -> 'transfers') as entry
         )
       )
     order by avatar.discord_id
     for key share;

    if not exists (
      select 1
        from public.guild_avatars as avatar
       where avatar.guild_id = p_guild_id
         and avatar.discord_id = p_actor_discord_id
         and avatar.withdrawn_at is null
    ) then
      raise exception 'SENDER_NOT_MEMBER';
    end if;

    select
      coalesce(sum((entry ->> 'amount')::integer), 0)::integer,
      count(*)::integer
      into v_total, v_recipient_count
      from jsonb_array_elements(p_execution_payload -> 'transfers') as entry;

    if v_total <= 0 then
      raise exception 'INVALID_AMOUNT';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(p_execution_payload -> 'transfers')
          with ordinality as execution_rows(entry, ordinal)
        join jsonb_array_elements(p_request_payload -> 'transfers')
          with ordinality as request_rows(entry, ordinal)
          using (ordinal)
       where execution_rows.entry ->> 'discord_id'
               is distinct from request_rows.entry ->> 'discord_id'
          or execution_rows.entry ->> 'amount'
               is distinct from request_rows.entry ->> 'amount'
          or execution_rows.entry ->> 'memo'
               is distinct from request_rows.entry ->> 'memo'
    ) then
      raise exception 'application_command_transfer_payload_mismatch';
    end if;
    if (
      select count(*)
        from public.guild_avatars as avatar
       where avatar.guild_id = p_guild_id
         and avatar.withdrawn_at is null
         and avatar.discord_id in (
           select entry ->> 'discord_id'
             from jsonb_array_elements(p_execution_payload -> 'transfers') as entry
         )
    ) <> (
      select count(distinct entry ->> 'discord_id')
        from jsonb_array_elements(p_execution_payload -> 'transfers') as entry
    ) then
      raise exception 'MEMBER_NOT_FOUND';
    end if;

    v_ref_id := public.transfer_points(
      p_actor_discord_id,
      p_guild_id,
      p_execution_payload -> 'transfers'
    );
    v_result := jsonb_build_object(
      'refId', v_ref_id,
      'total', v_total,
      'recipientCount', v_recipient_count,
      'spendableBefore',
        nullif(p_execution_payload ->> 'spendableBefore', '')::integer,
      'transfers', p_execution_payload -> 'transfers'
    );

  elsif p_command_name = 'shop.order' then
    if jsonb_typeof(p_execution_payload -> 'lines') <> 'array'
       or jsonb_array_length(p_execution_payload -> 'lines') < 1
       or jsonb_array_length(p_execution_payload -> 'lines') > 50 then
      raise exception 'application_command_shop_invalid';
    end if;

    if not exists (
      select 1
        from public.guild_avatars as avatar
       where avatar.guild_id = p_guild_id
         and avatar.discord_id = p_actor_discord_id
         and avatar.withdrawn_at is null
    ) then
      raise exception 'MEMBER_NOT_FOUND';
    end if;

    v_total := nullif(p_execution_payload ->> 'totalPoints', '')::integer;
    if v_total is null or v_total <= 0 then
      raise exception 'TOTAL_POINTS_NOT_POSITIVE';
    end if;
    if v_total is distinct from (
      select coalesce(sum((entry ->> 'subtotal_points')::integer), 0)::integer
        from jsonb_array_elements(p_execution_payload -> 'lines') as entry
    ) then
      raise exception 'application_command_shop_total_mismatch';
    end if;

    v_order_id := public.submit_shop_order(
      p_guild_id,
      p_actor_discord_id,
      p_actor_username,
      v_total,
      nullif(btrim(p_execution_payload ->> 'memberNote'), ''),
      coalesce((p_execution_payload ->> 'priceReviewRequired')::boolean, false),
      p_execution_payload -> 'lines'
    );
    v_result := jsonb_build_object(
      'orderId', v_order_id,
      'total', v_total,
      'status', 'pending',
      'spendableBefore',
        nullif(p_execution_payload ->> 'spendableBefore', '')::integer,
      'priceReviewRequired',
        coalesce((p_execution_payload ->> 'priceReviewRequired')::boolean, false),
      'lines', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'inventory_id', request_line ->> 'inventoryId',
              'unique_name', execution_line ->> 'unique_name',
              'enchant', (execution_line ->> 'enchant')::integer,
              'quality', (execution_line ->> 'quality')::integer,
              'name_ko', execution_line ->> 'name_ko',
              'quantity', (execution_line ->> 'quantity')::integer,
              'unit_points', (execution_line ->> 'unit_points')::integer,
              'subtotal_points', (execution_line ->> 'subtotal_points')::integer,
              'pricing_source', execution_line ->> 'pricing_source',
              'catalog_unit_silver_snapshot',
                nullif(execution_line ->> 'catalog_unit_silver_snapshot', '')::integer,
              'member_quote_unit_silver',
                nullif(execution_line ->> 'member_quote_unit_silver', '')::integer,
              'member_quote_unit_points',
                nullif(execution_line ->> 'member_quote_unit_points', '')::integer,
              'member_quote_city', execution_line ->> 'member_quote_city',
              'member_quote_note', execution_line ->> 'member_quote_note'
            )
            order by request_line ->> 'inventoryId'
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(p_request_payload -> 'lines')
          with ordinality as request_rows(request_line, ordinal)
        join jsonb_array_elements(p_execution_payload -> 'lines')
          with ordinality as execution_rows(execution_line, ordinal)
          using (ordinal)
      )
    );

  elsif p_command_name = 'craft.deliver' then
    v_task_id := nullif(p_request_payload ->> 'taskId', '')::uuid;
    v_box_number := nullif(p_request_payload ->> 'boxNumber', '')::integer;
    v_material_cost :=
      nullif(p_request_payload ->> 'materialSilverCost', '')::integer;
    v_expiry_days :=
      nullif(p_execution_payload ->> 'expiryDays', '')::integer;

    if v_task_id is null
       or v_box_number is null
       or v_box_number < 1
       or v_box_number > 999
       or v_material_cost is null
       or v_material_cost < 0
       or v_expiry_days is null
       or v_expiry_days < 1
       or v_expiry_days > 30 then
      raise exception 'application_command_craft_invalid';
    end if;

    select
      request.build_snapshot,
      request.craft_included_slots,
      request.discord_id,
      request.username,
      request.event_title_snapshot
      into
        v_build_snapshot,
        v_included_slots,
        v_requester_discord_id,
        v_requester_username,
        v_event_title_snapshot
      from public.craft_tasks as task
      join public.regear_requests as request
        on request.guild_id = task.guild_id
       and request.id = task.regear_request_id
     where task.guild_id = p_guild_id
       and task.id = v_task_id
       and task.status = 'claimed'
       and task.task_kind = 'regear'
       and task.crafter_discord_id = p_actor_discord_id
     for update of task;

    if not found then
      raise exception 'CRAFT_TASK_NOT_CLAIMED_BY_YOU';
    end if;

    perform public.deliver_craft_task(
      v_task_id,
      p_guild_id,
      p_actor_discord_id,
      v_box_number,
      '',
      false,
      v_material_cost,
      v_expiry_days
    );

    if v_build_snapshot is not null
       and jsonb_typeof(v_build_snapshot) = 'object' then
      if v_included_slots is null
         or jsonb_typeof(v_included_slots) <> 'array'
         or not exists (
           select 1
             from jsonb_array_elements_text(v_included_slots) as included(value)
            where included.value in (
              'weapon', 'head', 'armor', 'shoes', 'offhand', 'cape'
            )
         ) then
        v_included_slots := '["weapon","head","armor","shoes","offhand"]'::jsonb;
      end if;

      for v_slot in
        select allowed.value
          from unnest(
            array['weapon', 'head', 'armor', 'shoes', 'offhand', 'cape']::text[]
          ) as allowed(value)
         where v_included_slots ? allowed.value
      loop
        v_item_id := nullif(btrim(v_build_snapshot -> v_slot ->> 'id'), '');
        if v_item_id is null then
          continue;
        end if;

        -- Keep this equivalent to categorizeGearItem(): the snapshot slot
        -- controls inclusion, while the item id only needs to be recognized
        -- gear. Gathering tools remain excluded even though they look like 2H
        -- weapons.
        if not (
          (
            v_item_id ~ '^T[0-9]+_(2H|MAIN)_'
            and v_item_id !~ '^T[0-9]+_2H_TOOL_'
          )
          or v_item_id ~ '^T[0-9]+_(HEAD|ARMOR|SHOES)_(PLATE|LEATHER|CLOTH)(_|$)'
          or v_item_id ~ '^T[0-9]+_OFF_'
          or v_item_id ~ '^T[0-9]+_(CAPEITEM|CAPE)(_|$)'
          or v_item_id ~ '^T[0-9]+_BAG(_|$)'
        ) then
          continue;
        end if;

        select inventory.quantity
          into v_stock
          from public.guild_inventory_gear as inventory
         where inventory.guild_id = p_guild_id
           and inventory.item_id = v_item_id
         for update;

        if coalesce(v_stock, 0) < 1 then
          v_inventory_warned := true;
          if not (v_warned_item_ids @> jsonb_build_array(v_item_id)) then
            v_warned_item_ids := v_warned_item_ids || jsonb_build_array(v_item_id);
          end if;
        end if;

        perform public.adjust_inventory_gear(
          p_guild_id,
          v_item_id,
          -1,
          p_actor_discord_id
        );

        v_base_item_id := split_part(v_item_id, '@', 1);
        if v_base_item_id !~ '^T[0-9]+_(CAPEITEM|CAPE|BAG)(_|$)' then
          v_base_suffix :=
            nullif(regexp_replace(v_base_item_id, '^T[0-9]+_', ''), '');
          if v_base_suffix is not null then
            insert into public.guild_tracked_inventory_items (
              guild_id,
              base_suffix,
              sort_order
            ) values (
              p_guild_id,
              v_base_suffix,
              0
            )
            on conflict (guild_id, base_suffix) do nothing;
          end if;
        end if;
      end loop;
    end if;

    if v_inventory_warned then
      update public.craft_tasks
         set inventory_warned = true
       where guild_id = p_guild_id
         and id = v_task_id;
    end if;

    select
      task.reimbursement_silver,
      task.reimbursement_status
      into v_reimbursement_silver, v_reimbursement_status
      from public.craft_tasks as task
     where task.guild_id = p_guild_id
       and task.id = v_task_id;

    v_result := jsonb_build_object(
      'taskId', v_task_id,
      'status', 'delivered',
      'boxNumber', v_box_number,
      'materialSilverCost', v_material_cost,
      'expiryDays', v_expiry_days,
      'reimbursementSilver', coalesce(v_reimbursement_silver, 0),
      'reimbursementStatus', v_reimbursement_status,
      'reimbursementMode', (
        select task.compensation_mode
          from public.craft_tasks as task
         where task.guild_id = p_guild_id
           and task.id = v_task_id
      ),
      'inventoryWarned', v_inventory_warned,
      'warnedItemIds', v_warned_item_ids,
      'requesterDiscordId', v_requester_discord_id,
      'requesterUsername', v_requester_username,
      'eventTitle', v_event_title_snapshot
    );

  elsif p_command_name = 'event.start' then
    v_event_id := nullif(p_request_payload ->> 'eventId', '')::uuid;
    if v_event_id is null
       or nullif(p_execution_payload ->> 'startedAt', '') is null
       or nullif(p_execution_payload ->> 'policyVersionId', '') is null
       or jsonb_typeof(p_execution_payload -> 'policyConfigSnapshot') <> 'object'
       or jsonb_typeof(p_execution_payload -> 'participantSnapshots') <> 'array' then
      raise exception 'application_command_event_invalid';
    end if;

    v_domain_result := public.start_event_with_regear_policy_snapshots(
      p_guild_id,
      v_event_id,
      (p_execution_payload ->> 'startedAt')::timestamptz,
      (p_execution_payload ->> 'policyVersionId')::uuid,
      p_execution_payload -> 'policyConfigSnapshot',
      p_execution_payload -> 'participantSnapshots'
    );

    select event.title, event.status, event.battle_started_at, event.category
      into v_event_title, v_event_status, v_event_started_at, v_slot
      from public.events as event
     where event.guild_id = p_guild_id
       and event.id = v_event_id;

    insert into public.admin_audit_log (
      guild_id,
      admin_discord_id,
      action,
      target_id,
      target_kind,
      details
    ) values (
      p_guild_id,
      p_actor_discord_id,
      'event.update',
      v_event_id::text,
      'event',
      jsonb_build_object(
        'kind', 'battle_start',
        'startedAt', v_event_started_at,
        'source', p_source,
        'correlationId', p_correlation_id,
        'idempotencyKey', p_idempotency_key
      )
    );

    v_result := coalesce(v_domain_result, '{}'::jsonb) || jsonb_build_object(
      'eventId', v_event_id,
      'title', v_event_title,
      'category', v_slot,
      'status', v_event_status,
      'battleStartedAt', v_event_started_at
    );
  end if;

  if v_result is null or jsonb_typeof(v_result) <> 'object' then
    raise exception 'application_command_result_invalid';
  end if;

  insert into public.application_command_runs (
    guild_id,
    command_name,
    idempotency_key,
    correlation_id,
    actor_discord_id,
    actor_username,
    source,
    request_payload,
    result
  ) values (
    p_guild_id,
    p_command_name,
    p_idempotency_key,
    p_correlation_id,
    p_actor_discord_id,
    p_actor_username,
    p_source,
    p_request_payload,
    v_result
  );

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.execute_application_command(
  uuid, text, uuid, text, text, text, text, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.execute_application_command(
  uuid, text, uuid, text, text, text, text, jsonb, jsonb, uuid
) to service_role;

comment on table public.application_command_runs is
  'Immutable tenant-scoped receipts for shared web/Discord application commands.';
comment on table public.application_command_confirmations is
  'Short-lived actor-bound Discord confirmation tokens; payloads are server-generated and service-role only.';
comment on function public.execute_application_command(
  uuid, text, uuid, text, text, text, text, jsonb, jsonb, uuid
) is
  'Atomically executes one supported application command and records/replays its idempotent result.';
