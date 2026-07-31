-- Release B: make Discord delivery claims atomic and drain the generic domain
-- outbox. External sends cannot participate in a database transaction, so a
-- short lease and opaque claim token prevent concurrent duplicate delivery.

alter table public.admin_notification_deliveries
  alter column delivered_at drop not null,
  alter column delivered_at drop default,
  add column if not exists status text not null default 'sent',
  add column if not exists attempts integer not null default 1,
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists last_error text;

alter table public.admin_notification_deliveries
  add constraint admin_notification_deliveries_status_check
    check (status in ('processing', 'sent', 'failed')),
  add constraint admin_notification_deliveries_attempts_check
    check (attempts between 0 and 20),
  add constraint admin_notification_deliveries_claim_check
    check (
      (status = 'processing' and claim_token is not null and claimed_at is not null and delivered_at is null)
      or (status = 'sent' and claim_token is null and claimed_at is null and delivered_at is not null)
      or (status = 'failed' and claim_token is null and claimed_at is null and delivered_at is null)
    ),
  add constraint admin_notification_deliveries_error_check
    check (last_error is null or char_length(last_error) <= 1000);

update public.admin_notification_deliveries
   set status = 'sent',
       attempts = greatest(attempts, 1),
       claim_token = null,
       claimed_at = null,
       last_error = null,
       delivered_at = coalesce(delivered_at, created_at, now());

create or replace function public.claim_admin_notification_delivery(
  p_guild_id uuid,
  p_topic text,
  p_source_table text,
  p_source_id text,
  p_delivery_kind text,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_notification_deliveries%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if p_guild_id is null
     or nullif(btrim(coalesce(p_topic, '')), '') is null
     or nullif(btrim(coalesce(p_source_table, '')), '') is null
     or nullif(btrim(coalesce(p_source_id, '')), '') is null
     or p_delivery_kind not in ('channel', 'digest')
     or p_lease_seconds not between 30 and 1800 then
    raise exception 'ADMIN_NOTIFICATION_CLAIM_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_guild_id::text || ':admin-notification:' || p_topic || ':' ||
      p_source_table || ':' || p_source_id || ':' || p_delivery_kind,
      0
    )
  );

  select delivery.*
    into v_row
    from public.admin_notification_deliveries delivery
   where delivery.guild_id = p_guild_id
     and delivery.topic = p_topic
     and delivery.source_table = p_source_table
     and delivery.source_id = p_source_id
     and delivery.delivery_kind = p_delivery_kind
   for update;

  if found then
    if v_row.status = 'sent' then
      return jsonb_build_object('claimed', false, 'status', 'sent');
    end if;
    if v_row.status = 'processing'
       and v_row.claimed_at > now() - make_interval(secs => p_lease_seconds) then
      return jsonb_build_object('claimed', false, 'status', 'processing');
    end if;
    if v_row.attempts >= 5 then
      return jsonb_build_object('claimed', false, 'status', 'exhausted');
    end if;

    update public.admin_notification_deliveries
       set status = 'processing',
           attempts = attempts + 1,
           claim_token = v_token,
           claimed_at = now(),
           delivered_at = null,
           last_error = null
     where id = v_row.id;
  else
    insert into public.admin_notification_deliveries (
      guild_id,
      topic,
      source_table,
      source_id,
      delivery_kind,
      status,
      attempts,
      claim_token,
      claimed_at,
      delivered_at
    ) values (
      p_guild_id,
      p_topic,
      p_source_table,
      p_source_id,
      p_delivery_kind,
      'processing',
      1,
      v_token,
      now(),
      null
    )
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'claimed', true,
    'status', 'processing',
    'claimToken', v_token
  );
end;
$$;

create or replace function public.complete_admin_notification_delivery(
  p_guild_id uuid,
  p_topic text,
  p_source_table text,
  p_source_id text,
  p_delivery_kind text,
  p_claim_token uuid,
  p_status text,
  p_discord_channel_id text default null,
  p_discord_message_id text default null,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_claim_token is null or p_status not in ('sent', 'failed') then
    raise exception 'ADMIN_NOTIFICATION_COMPLETION_INVALID';
  end if;

  update public.admin_notification_deliveries
     set status = p_status,
         claim_token = null,
         claimed_at = null,
         discord_channel_id = case when p_status = 'sent' then nullif(btrim(coalesce(p_discord_channel_id, '')), '') else null end,
         discord_message_id = case when p_status = 'sent' then nullif(btrim(coalesce(p_discord_message_id, '')), '') else null end,
         delivered_at = case when p_status = 'sent' then now() else null end,
         last_error = case when p_status = 'failed' then left(coalesce(nullif(btrim(p_error), ''), 'delivery_failed'), 1000) else null end
   where guild_id = p_guild_id
     and topic = p_topic
     and source_table = p_source_table
     and source_id = p_source_id
     and delivery_kind = p_delivery_kind
     and status = 'processing'
     and claim_token = p_claim_token;

  return found;
end;
$$;

revoke all on function public.claim_admin_notification_delivery(uuid, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_admin_notification_delivery(uuid, text, text, text, text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_admin_notification_delivery(uuid, text, text, text, text, integer)
  to service_role;
grant execute on function public.complete_admin_notification_delivery(uuid, text, text, text, text, uuid, text, text, text, text)
  to service_role;


alter table public.domain_outbox
  add column if not exists claim_token uuid;

alter table public.domain_outbox
  add constraint domain_outbox_claim_check
    check (
      (status = 'processing' and claim_token is not null and claimed_at is not null)
      or (status <> 'processing' and claim_token is null and claimed_at is null)
    );

create or replace function public.claim_domain_outbox(
  p_limit integer default 50,
  p_lease_seconds integer default 300
) returns table (
  id uuid,
  guild_id uuid,
  topic text,
  aggregate_kind text,
  aggregate_id uuid,
  recipient_kind text,
  recipient_member_id uuid,
  payload jsonb,
  claim_token uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 30 and 1800 then
    raise exception 'DOMAIN_OUTBOX_CLAIM_INVALID';
  end if;

  return query
  with candidates as (
    select outbox.id
      from public.domain_outbox outbox
     where (
       outbox.status in ('pending', 'failed')
       or (
         outbox.status = 'processing'
         and outbox.claimed_at < now() - make_interval(secs => p_lease_seconds)
       )
     )
       and outbox.attempts < 5
       and outbox.available_at <= now()
     order by outbox.available_at, outbox.created_at, outbox.id
     for update skip locked
     limit p_limit
  )
  update public.domain_outbox outbox
     set status = 'processing',
         attempts = outbox.attempts + 1,
         claim_token = gen_random_uuid(),
         claimed_at = now(),
         last_error = null,
         updated_at = now()
    from candidates
   where outbox.id = candidates.id
  returning
    outbox.id,
    outbox.guild_id,
    outbox.topic,
    outbox.aggregate_kind,
    outbox.aggregate_id,
    outbox.recipient_kind,
    outbox.recipient_member_id,
    outbox.payload,
    outbox.claim_token,
    outbox.attempts;
end;
$$;

create or replace function public.complete_domain_outbox(
  p_id uuid,
  p_claim_token uuid,
  p_status text,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null
     or p_claim_token is null
     or p_status not in ('sent', 'failed', 'cancelled') then
    raise exception 'DOMAIN_OUTBOX_COMPLETION_INVALID';
  end if;

  update public.domain_outbox
     set status = p_status,
         claim_token = null,
         claimed_at = null,
         delivered_at = case when p_status = 'sent' then now() else delivered_at end,
         available_at = case
           when p_status = 'failed'
             then now() + make_interval(secs => least(1800, 30 * power(2, attempts)))
           else available_at
         end,
         last_error = case
           when p_status = 'failed' then left(coalesce(nullif(btrim(p_error), ''), 'delivery_failed'), 1000)
           else null
         end,
         updated_at = now()
   where id = p_id
     and status = 'processing'
     and claim_token = p_claim_token;

  return found;
end;
$$;

revoke all on function public.claim_domain_outbox(integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_domain_outbox(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_domain_outbox(integer, integer)
  to service_role;
grant execute on function public.complete_domain_outbox(uuid, uuid, text, text)
  to service_role;

comment on function public.claim_admin_notification_delivery(uuid, text, text, text, text, integer) is
  'Atomically reserves one external Discord channel delivery. A fresh claim blocks concurrent duplicate sends.';
comment on function public.claim_domain_outbox(integer, integer) is
  'Claims a bounded retry-safe generic outbox batch with per-row lease tokens.';

notify pgrst, 'reload schema';
