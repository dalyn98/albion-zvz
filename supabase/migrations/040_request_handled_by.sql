-- Track which admin approved / rejected each request so the history pane
-- shows accountability ("승인: @adminName"). Discord ID + username snapshot
-- are stored together — the ID is stable, but the snapshotted username lets
-- us display a human-readable handler even after the admin's display name
-- changes or they leave the guild.
--
-- Legacy rows stay null. UI reads that as "기록 없음".

alter table public.regear_requests
  add column if not exists handled_by text,
  add column if not exists handled_by_username text;

alter table public.exchange_requests
  add column if not exists handled_by text,
  add column if not exists handled_by_username text;

alter table public.donation_requests
  add column if not exists handled_by text,
  add column if not exists handled_by_username text;

-- Rewrite the 6 approve/reject RPCs to accept p_admin_id + p_admin_username
-- and persist them onto the row. FOR UPDATE lock still serializes concurrent
-- approvers so there's no double-credit risk.

create or replace function public.approve_regear_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_claimed integer;
begin
  select discord_id, claimed_silver
    into v_discord, v_claimed
    from regear_requests
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id;

  insert into point_ledger (discord_id, delta, reason, ref_id)
       values (v_discord, v_claimed, 'regear_approved', p_id);
end;
$$;

create or replace function public.reject_regear_request(
  p_id uuid,
  p_notes text,
  p_admin_id text,
  p_admin_username text
) returns void language plpgsql security definer as $$
begin
  update regear_requests
     set status = 'rejected',
         resolved_at = now(),
         admin_notes = p_notes,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id and status = 'pending';

  if not found then
    raise exception 'REGEAR_NOT_PENDING';
  end if;
end;
$$;

create or replace function public.approve_exchange_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_silver  integer;
  v_balance integer;
begin
  select discord_id, silver into v_discord, v_silver
    from exchange_requests
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_discord, 0));

  select coalesce(sum(delta), 0) into v_balance
    from point_ledger where discord_id = v_discord;

  if v_balance < v_silver then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update exchange_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id;

  insert into point_ledger (discord_id, delta, reason, ref_id)
       values (v_discord, -v_silver, 'exchange_paid', p_id);
end;
$$;

create or replace function public.reject_exchange_request(
  p_id uuid,
  p_notes text,
  p_admin_id text,
  p_admin_username text
) returns void language plpgsql security definer as $$
begin
  update exchange_requests
     set status = 'rejected',
         resolved_at = now(),
         admin_notes = p_notes,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id and status = 'pending';

  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;
end;
$$;

create or replace function public.approve_donation_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_silver  integer;
begin
  select discord_id, silver into v_discord, v_silver
    from donation_requests
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'DONATION_NOT_PENDING';
  end if;

  update donation_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id;

  insert into point_ledger (discord_id, delta, reason, ref_id)
       values (v_discord, v_silver, 'donation_approved', p_id);
end;
$$;

create or replace function public.reject_donation_request(
  p_id uuid,
  p_notes text,
  p_admin_id text,
  p_admin_username text
) returns void language plpgsql security definer as $$
begin
  update donation_requests
     set status = 'rejected',
         resolved_at = now(),
         admin_notes = p_notes,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id and status = 'pending';

  if not found then
    raise exception 'DONATION_NOT_PENDING';
  end if;
end;
$$;

-- Drop the old RPC signatures so stale callers (or cached PostgREST schema
-- entries) fail loudly instead of silently skipping the audit fields.
drop function if exists public.approve_regear_request(uuid);
drop function if exists public.reject_regear_request(uuid, text);
drop function if exists public.approve_exchange_request(uuid);
drop function if exists public.reject_exchange_request(uuid, text);
drop function if exists public.approve_donation_request(uuid);
drop function if exists public.reject_donation_request(uuid, text);
