-- 248: Discord-role based regear claim caps.
--
-- When enabled per guild, members keep selecting a site regear role group, but
-- the claim cap is resolved from their Discord roles for that group. Rate
-- calculation remains the existing guild/event/video policy.

create table if not exists public.regear_discord_role_policies (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_role_id text not null,
  discord_role_name text not null,
  regear_role_group text not null,
  silver_cap integer not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint regear_discord_role_policies_role_id_chk
    check (discord_role_id ~ '^[0-9]{5,30}$'),
  constraint regear_discord_role_policies_role_name_chk
    check (length(btrim(discord_role_name)) > 0 and length(discord_role_name) <= 100),
  constraint regear_discord_role_policies_group_chk
    check (regear_role_group in ('dps', 'healer', 'tank', 'support', 'battle_mount', 'other')),
  constraint regear_discord_role_policies_silver_cap_chk
    check (silver_cap >= 0 and silver_cap <= 2000000000),
  constraint regear_discord_role_policies_unique_role
    unique (guild_id, discord_role_id)
);

create index if not exists regear_discord_role_policies_group_cap_idx
  on public.regear_discord_role_policies (guild_id, regear_role_group, silver_cap desc);

alter table public.regear_discord_role_policies enable row level security;

grant select, insert, update, delete on public.regear_discord_role_policies to service_role;

comment on table public.regear_discord_role_policies is
  'Per-tenant Discord role to regear role group cap policies. One Discord role maps to one regear role group.';
comment on column public.regear_discord_role_policies.regear_role_group is
  'Policy role group: dps includes EngageDps and BrawlerDps.';
comment on column public.regear_discord_role_policies.silver_cap is
  'Claim ceiling applied when the requester has this Discord role and selected the matching regear role group.';

insert into public.app_settings (guild_id, key, value, updated_at)
select id, 'regear_discord_role_policy_enabled', 'false', now()
  from public.tenants
on conflict (guild_id, key) do nothing;

alter table public.regear_requests
  add column if not exists regear_role_group text,
  add column if not exists regear_role_policy_enabled boolean not null default false,
  add column if not exists regear_role_policy_match_status text not null default 'disabled',
  add column if not exists regear_role_policy_discord_role_id text,
  add column if not exists regear_role_policy_discord_role_name text,
  add column if not exists regear_role_policy_silver_cap integer,
  add column if not exists regear_role_policy_member_role_ids text[];

alter table public.regear_requests
  drop constraint if exists regear_requests_role_group_chk;

alter table public.regear_requests
  add constraint regear_requests_role_group_chk
  check (
    regear_role_group is null
    or regear_role_group in ('dps', 'healer', 'tank', 'support', 'battle_mount', 'other')
  );

alter table public.regear_requests
  drop constraint if exists regear_requests_role_policy_match_status_chk;

alter table public.regear_requests
  add constraint regear_requests_role_policy_match_status_chk
  check (regear_role_policy_match_status in ('disabled', 'matched', 'no_match', 'roles_unavailable'));

alter table public.regear_requests
  drop constraint if exists regear_requests_role_policy_silver_cap_chk;

alter table public.regear_requests
  add constraint regear_requests_role_policy_silver_cap_chk
  check (
    regear_role_policy_silver_cap is null
    or (regear_role_policy_silver_cap >= 0 and regear_role_policy_silver_cap <= 2000000000)
  );

comment on column public.regear_requests.regear_role_group is
  'Requester-selected site regear role group snapshot used for Discord-role cap matching.';
comment on column public.regear_requests.regear_role_policy_enabled is
  'Whether Discord-role cap policy was enabled when this request was created.';
comment on column public.regear_requests.regear_role_policy_match_status is
  'disabled/matched/no_match/roles_unavailable at request creation.';
comment on column public.regear_requests.regear_role_policy_discord_role_id is
  'Matched Discord role id snapshot, if any.';
comment on column public.regear_requests.regear_role_policy_discord_role_name is
  'Matched Discord role display name snapshot, if any.';
comment on column public.regear_requests.regear_role_policy_silver_cap is
  'Matched Discord role cap snapshot. NULL when disabled, 0 when no matching role.';
comment on column public.regear_requests.regear_role_policy_member_role_ids is
  'Requester Discord role ids observed at request creation for admin review.';

create or replace function public.approve_regear_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid,
  p_payout_silver integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord text;
  v_claimed integer;
  v_silver integer;
  v_base_silver integer;
  v_cap integer;
  v_credit integer;
begin
  select discord_id, claimed_silver, silver, base_silver
    into v_discord, v_claimed, v_silver, v_base_silver
    from regear_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;

  v_cap := greatest(coalesce(v_claimed, 0), coalesce(v_silver, 0), coalesce(v_base_silver, 0));
  v_credit := coalesce(p_payout_silver, v_claimed, 0);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_cap then v_credit := v_cap; end if;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         fulfillment_mode = 'silver',
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (p_guild_id, v_discord, v_credit, 'regear_approved', p_id);

  update craft_tasks
     set status = 'cancelled',
         cancelled_at = now()
   where regear_request_id = p_id
     and guild_id = p_guild_id
     and status in ('queued', 'claimed');
end;
$$;

comment on function public.approve_regear_request(uuid, text, text, uuid, integer) is
  '리기어 승인 = silver 지급. Admin override payout is clamped to the request cap snapshot (silver/base_silver), allowing 0-claim review rows to be adjusted.';

revoke all on function public.approve_regear_request(uuid, text, text, uuid, integer) from public;
revoke all on function public.approve_regear_request(uuid, text, text, uuid, integer) from anon, authenticated;
grant execute on function public.approve_regear_request(uuid, text, text, uuid, integer) to service_role;
