-- Release C: continue the stable-member expand/read-cutover without removing
-- any legacy Discord compatibility column.
--
-- Exact tenant-scoped access identities project to nullable member UUIDs.
-- Historical/unresolved subjects remain readable through their legacy key,
-- and no identity conflict is merged or resolved by this migration.

create or replace function public.project_operational_guild_member_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_column text := tg_argv[0];
  v_member_column text := tg_argv[1];
  v_subject text;
  v_requested_member_id uuid;
  v_resolved_member_id uuid;
begin
  v_subject := nullif(btrim(to_jsonb(new) ->> v_subject_column), '');
  v_requested_member_id := nullif(to_jsonb(new) ->> v_member_column, '')::uuid;

  if new.guild_id is null then
    if v_requested_member_id is not null then
      raise exception 'GUILD_MEMBER_ACCESS_IDENTITY_NOT_FOUND';
    end if;
    new := jsonb_populate_record(
      new,
      jsonb_build_object(v_member_column, null)
    );
    return new;
  end if;

  -- Lifecycle RPCs clear compatibility subjects without explicitly clearing
  -- their projected UUID column. Treat the subject as authoritative and clear
  -- the projection in the same write.
  if v_subject is null then
    new := jsonb_populate_record(
      new,
      jsonb_build_object(v_member_column, null)
    );
    return new;
  end if;

  v_resolved_member_id := public.resolve_guild_member_id(
    new.guild_id,
    public.guild_member_access_identity_type(v_subject),
    v_subject
  );

  if v_requested_member_id is not null and v_resolved_member_id is null then
    raise exception 'GUILD_MEMBER_ACCESS_IDENTITY_NOT_FOUND';
  end if;
  if v_requested_member_id is not null
     and v_requested_member_id is distinct from v_resolved_member_id then
    raise exception 'GUILD_MEMBER_IDENTITY_MISMATCH';
  end if;

  new := jsonb_populate_record(
    new,
    jsonb_build_object(v_member_column, v_resolved_member_id)
  );
  return new;
end;
$$;

revoke all on function public.project_operational_guild_member_id()
  from public, anon, authenticated, service_role;

alter table public.point_ledger
  add column if not exists guild_member_id uuid;
alter table public.member_point_balances
  add column if not exists guild_member_id uuid;
alter table public.point_escrows
  add column if not exists guild_member_id uuid;
alter table public.exchange_requests
  add column if not exists guild_member_id uuid;
alter table public.donation_requests
  add column if not exists guild_member_id uuid;
alter table public.shop_orders
  add column if not exists guild_member_id uuid;
alter table public.member_trade_listings
  add column if not exists seller_guild_member_id uuid;
alter table public.member_trade_orders
  add column if not exists buyer_guild_member_id uuid,
  add column if not exists seller_guild_member_id uuid;
alter table public.member_trade_price_offers
  add column if not exists buyer_guild_member_id uuid,
  add column if not exists seller_guild_member_id uuid;
alter table public.member_trade_events
  add column if not exists actor_guild_member_id uuid;
alter table public.craft_tasks
  add column if not exists crafter_guild_member_id uuid;
alter table public.craft_orders
  add column if not exists posted_by_member_id uuid,
  add column if not exists cancelled_by_member_id uuid;
alter table public.member_exchange_restrictions
  add column if not exists guild_member_id uuid;
alter table public.member_gameplay_video_uploads
  add column if not exists guild_member_id uuid;
alter table public.alliance_content_participations
  add column if not exists guild_member_id uuid;
alter table public.alliance_content_video_requirements
  add column if not exists guild_member_id uuid;
alter table public.alliance_content_video_submissions
  add column if not exists guild_member_id uuid;
alter table public.event_regear_policy_snapshots
  add column if not exists guild_member_id uuid;

alter table public.point_ledger
  add constraint point_ledger_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.member_point_balances
  add constraint member_point_balances_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.point_escrows
  add constraint point_escrows_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.exchange_requests
  add constraint exchange_requests_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.donation_requests
  add constraint donation_requests_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.shop_orders
  add constraint shop_orders_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.member_trade_listings
  add constraint member_trade_listings_seller_stable_member_fkey
  foreign key (guild_id, seller_guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.member_trade_orders
  add constraint member_trade_orders_buyer_stable_member_fkey
  foreign key (guild_id, buyer_guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid,
  add constraint member_trade_orders_seller_stable_member_fkey
  foreign key (guild_id, seller_guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.member_trade_price_offers
  add constraint member_trade_price_offers_buyer_stable_member_fkey
  foreign key (guild_id, buyer_guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid,
  add constraint member_trade_price_offers_seller_stable_member_fkey
  foreign key (guild_id, seller_guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.member_trade_events
  add constraint member_trade_events_actor_stable_member_fkey
  foreign key (guild_id, actor_guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.craft_tasks
  add constraint craft_tasks_crafter_stable_member_fkey
  foreign key (guild_id, crafter_guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.craft_orders
  add constraint craft_orders_poster_stable_member_fkey
  foreign key (guild_id, posted_by_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid,
  add constraint craft_orders_canceller_stable_member_fkey
  foreign key (guild_id, cancelled_by_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.member_exchange_restrictions
  add constraint member_exchange_restrictions_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.member_gameplay_video_uploads
  add constraint member_gameplay_video_uploads_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.alliance_content_participations
  add constraint alliance_content_participations_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.alliance_content_video_requirements
  add constraint alliance_content_video_requirements_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.alliance_content_video_submissions
  add constraint alliance_content_video_submissions_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;
alter table public.event_regear_policy_snapshots
  add constraint event_regear_policy_snapshots_stable_member_fkey
  foreign key (guild_id, guild_member_id)
  references public.guild_member_records(guild_id, id)
  on delete restrict not valid;

create or replace function public.backfill_operational_guild_member_id(
  p_table regclass,
  p_subject_column name,
  p_member_column name
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  execute format(
    'update %s row set %I = public.resolve_guild_member_id('
      || 'row.guild_id, public.guild_member_access_identity_type(row.%I), row.%I) '
      || 'where row.%I is null and nullif(btrim(row.%I), '''') is not null',
    p_table,
    p_member_column,
    p_subject_column,
    p_subject_column,
    p_member_column,
    p_subject_column
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

select public.backfill_operational_guild_member_id(
  'public.point_ledger', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.member_point_balances', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.point_escrows', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.exchange_requests', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.donation_requests', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.shop_orders', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.member_trade_listings', 'seller_discord_id', 'seller_guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.member_trade_orders', 'buyer_discord_id', 'buyer_guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.member_trade_orders', 'seller_discord_id', 'seller_guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.member_trade_price_offers', 'buyer_discord_id', 'buyer_guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.member_trade_price_offers', 'seller_discord_id', 'seller_guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.member_trade_events', 'actor_discord_id', 'actor_guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.craft_tasks', 'crafter_discord_id', 'crafter_guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.craft_orders', 'posted_by_discord_id', 'posted_by_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.craft_orders', 'cancelled_by_discord_id', 'cancelled_by_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.member_exchange_restrictions', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.member_gameplay_video_uploads', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.alliance_content_participations', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.alliance_content_video_requirements', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.alliance_content_video_submissions', 'discord_id', 'guild_member_id'
);
select public.backfill_operational_guild_member_id(
  'public.event_regear_policy_snapshots', 'discord_id', 'guild_member_id'
);

drop function public.backfill_operational_guild_member_id(regclass, name, name);

alter table public.point_ledger validate constraint point_ledger_stable_member_fkey;
alter table public.member_point_balances validate constraint member_point_balances_stable_member_fkey;
alter table public.point_escrows validate constraint point_escrows_stable_member_fkey;
alter table public.exchange_requests validate constraint exchange_requests_stable_member_fkey;
alter table public.donation_requests validate constraint donation_requests_stable_member_fkey;
alter table public.shop_orders validate constraint shop_orders_stable_member_fkey;
alter table public.member_trade_listings validate constraint member_trade_listings_seller_stable_member_fkey;
alter table public.member_trade_orders validate constraint member_trade_orders_buyer_stable_member_fkey;
alter table public.member_trade_orders validate constraint member_trade_orders_seller_stable_member_fkey;
alter table public.member_trade_price_offers validate constraint member_trade_price_offers_buyer_stable_member_fkey;
alter table public.member_trade_price_offers validate constraint member_trade_price_offers_seller_stable_member_fkey;
alter table public.member_trade_events validate constraint member_trade_events_actor_stable_member_fkey;
alter table public.craft_tasks validate constraint craft_tasks_crafter_stable_member_fkey;
alter table public.craft_orders validate constraint craft_orders_poster_stable_member_fkey;
alter table public.craft_orders validate constraint craft_orders_canceller_stable_member_fkey;
alter table public.member_exchange_restrictions validate constraint member_exchange_restrictions_stable_member_fkey;
alter table public.member_gameplay_video_uploads validate constraint member_gameplay_video_uploads_stable_member_fkey;
alter table public.alliance_content_participations validate constraint alliance_content_participations_stable_member_fkey;
alter table public.alliance_content_video_requirements validate constraint alliance_content_video_requirements_stable_member_fkey;
alter table public.alliance_content_video_submissions validate constraint alliance_content_video_submissions_stable_member_fkey;
alter table public.event_regear_policy_snapshots validate constraint event_regear_policy_snapshots_stable_member_fkey;

drop trigger if exists project_point_ledger_stable_member on public.point_ledger;
create trigger project_point_ledger_stable_member
before insert or update of guild_id, discord_id, guild_member_id
on public.point_ledger for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_member_point_balance_stable_member on public.member_point_balances;
create trigger project_member_point_balance_stable_member
before insert or update of guild_id, discord_id, guild_member_id
on public.member_point_balances for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_point_escrow_stable_member on public.point_escrows;
create trigger project_point_escrow_stable_member
before insert or update of guild_id, discord_id, guild_member_id
on public.point_escrows for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_exchange_request_stable_member on public.exchange_requests;
create trigger project_exchange_request_stable_member
before insert or update of guild_id, discord_id, guild_member_id
on public.exchange_requests for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_donation_request_stable_member on public.donation_requests;
create trigger project_donation_request_stable_member
before insert or update of guild_id, discord_id, guild_member_id
on public.donation_requests for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_shop_order_stable_member on public.shop_orders;
create trigger project_shop_order_stable_member
before insert or update of guild_id, discord_id, guild_member_id
on public.shop_orders for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_member_trade_listing_seller on public.member_trade_listings;
create trigger project_member_trade_listing_seller
before insert or update of guild_id, seller_discord_id, seller_guild_member_id
on public.member_trade_listings for each row
execute function public.project_operational_guild_member_id('seller_discord_id', 'seller_guild_member_id');

drop trigger if exists project_member_trade_order_buyer on public.member_trade_orders;
create trigger project_member_trade_order_buyer
before insert or update of guild_id, buyer_discord_id, buyer_guild_member_id
on public.member_trade_orders for each row
execute function public.project_operational_guild_member_id('buyer_discord_id', 'buyer_guild_member_id');
drop trigger if exists project_member_trade_order_seller on public.member_trade_orders;
create trigger project_member_trade_order_seller
before insert or update of guild_id, seller_discord_id, seller_guild_member_id
on public.member_trade_orders for each row
execute function public.project_operational_guild_member_id('seller_discord_id', 'seller_guild_member_id');

drop trigger if exists project_member_trade_offer_buyer on public.member_trade_price_offers;
create trigger project_member_trade_offer_buyer
before insert or update of guild_id, buyer_discord_id, buyer_guild_member_id
on public.member_trade_price_offers for each row
execute function public.project_operational_guild_member_id('buyer_discord_id', 'buyer_guild_member_id');
drop trigger if exists project_member_trade_offer_seller on public.member_trade_price_offers;
create trigger project_member_trade_offer_seller
before insert or update of guild_id, seller_discord_id, seller_guild_member_id
on public.member_trade_price_offers for each row
execute function public.project_operational_guild_member_id('seller_discord_id', 'seller_guild_member_id');

drop trigger if exists project_member_trade_event_actor on public.member_trade_events;
create trigger project_member_trade_event_actor
before insert or update of guild_id, actor_discord_id, actor_guild_member_id
on public.member_trade_events for each row
execute function public.project_operational_guild_member_id('actor_discord_id', 'actor_guild_member_id');

drop trigger if exists project_craft_task_crafter on public.craft_tasks;
create trigger project_craft_task_crafter
before insert or update of guild_id, crafter_discord_id, crafter_guild_member_id
on public.craft_tasks for each row
execute function public.project_operational_guild_member_id('crafter_discord_id', 'crafter_guild_member_id');

drop trigger if exists project_craft_order_poster on public.craft_orders;
create trigger project_craft_order_poster
before insert or update of guild_id, posted_by_discord_id, posted_by_member_id
on public.craft_orders for each row
execute function public.project_operational_guild_member_id('posted_by_discord_id', 'posted_by_member_id');
drop trigger if exists project_craft_order_canceller on public.craft_orders;
create trigger project_craft_order_canceller
before insert or update of guild_id, cancelled_by_discord_id, cancelled_by_member_id
on public.craft_orders for each row
execute function public.project_operational_guild_member_id('cancelled_by_discord_id', 'cancelled_by_member_id');

drop trigger if exists project_member_exchange_restriction_member on public.member_exchange_restrictions;
create trigger project_member_exchange_restriction_member
before insert or update of guild_id, discord_id, guild_member_id
on public.member_exchange_restrictions for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_member_gameplay_video_member on public.member_gameplay_video_uploads;
create trigger project_member_gameplay_video_member
before insert or update of guild_id, discord_id, guild_member_id
on public.member_gameplay_video_uploads for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_alliance_content_participation_member on public.alliance_content_participations;
create trigger project_alliance_content_participation_member
before insert or update of guild_id, discord_id, guild_member_id
on public.alliance_content_participations for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_alliance_content_requirement_member on public.alliance_content_video_requirements;
create trigger project_alliance_content_requirement_member
before insert or update of guild_id, discord_id, guild_member_id
on public.alliance_content_video_requirements for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_alliance_content_submission_member on public.alliance_content_video_submissions;
create trigger project_alliance_content_submission_member
before insert or update of guild_id, discord_id, guild_member_id
on public.alliance_content_video_submissions for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

drop trigger if exists project_event_regear_policy_snapshot_member on public.event_regear_policy_snapshots;
create trigger project_event_regear_policy_snapshot_member
before insert or update of guild_id, discord_id, guild_member_id
on public.event_regear_policy_snapshots for each row
execute function public.project_operational_guild_member_id('discord_id', 'guild_member_id');

create index if not exists point_ledger_stable_member_idx
  on public.point_ledger (guild_id, guild_member_id, created_at desc)
  where guild_member_id is not null;
create index if not exists member_point_balances_stable_member_idx
  on public.member_point_balances (guild_id, guild_member_id)
  where guild_member_id is not null;
create index if not exists point_escrows_stable_member_idx
  on public.point_escrows (guild_id, guild_member_id, created_at desc)
  where guild_member_id is not null;
create index if not exists exchange_requests_stable_member_idx
  on public.exchange_requests (guild_id, guild_member_id, created_at desc)
  where guild_member_id is not null;
create index if not exists donation_requests_stable_member_idx
  on public.donation_requests (guild_id, guild_member_id, created_at desc)
  where guild_member_id is not null;
create index if not exists shop_orders_stable_member_idx
  on public.shop_orders (guild_id, guild_member_id, created_at desc)
  where guild_member_id is not null;
create index if not exists member_trade_listings_stable_seller_idx
  on public.member_trade_listings (guild_id, seller_guild_member_id, created_at desc)
  where seller_guild_member_id is not null;
create index if not exists member_trade_orders_stable_buyer_idx
  on public.member_trade_orders (guild_id, buyer_guild_member_id, created_at desc)
  where buyer_guild_member_id is not null;
create index if not exists member_trade_orders_stable_seller_idx
  on public.member_trade_orders (guild_id, seller_guild_member_id, created_at desc)
  where seller_guild_member_id is not null;
create index if not exists member_trade_offers_stable_buyer_idx
  on public.member_trade_price_offers (guild_id, buyer_guild_member_id, created_at desc)
  where buyer_guild_member_id is not null;
create index if not exists member_trade_offers_stable_seller_idx
  on public.member_trade_price_offers (guild_id, seller_guild_member_id, created_at desc)
  where seller_guild_member_id is not null;
create index if not exists craft_tasks_stable_crafter_idx
  on public.craft_tasks (guild_id, crafter_guild_member_id, created_at desc)
  where crafter_guild_member_id is not null;
create index if not exists member_gameplay_video_stable_member_idx
  on public.member_gameplay_video_uploads (guild_id, guild_member_id, uploaded_at desc)
  where guild_member_id is not null;
create index if not exists event_regear_policy_snapshot_stable_member_idx
  on public.event_regear_policy_snapshots (guild_id, guild_member_id, event_id)
  where guild_member_id is not null;

-- When an exact access identity is attached or deliberately moved by the
-- existing merge command, converge only its derived member projections.
create or replace function public.sync_operational_ownership_for_access_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := new.subject_id;
  v_member_id uuid := new.guild_member_id;
begin
  if new.guild_id is null or v_subject is null or v_member_id is null then
    return new;
  end if;

  update public.point_ledger set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.member_point_balances set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.point_escrows set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.exchange_requests set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.donation_requests set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.shop_orders set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.member_trade_listings set seller_guild_member_id = v_member_id
   where guild_id = new.guild_id and seller_discord_id = v_subject;
  update public.member_trade_orders set buyer_guild_member_id = v_member_id
   where guild_id = new.guild_id and buyer_discord_id = v_subject;
  update public.member_trade_orders set seller_guild_member_id = v_member_id
   where guild_id = new.guild_id and seller_discord_id = v_subject;
  update public.member_trade_price_offers set buyer_guild_member_id = v_member_id
   where guild_id = new.guild_id and buyer_discord_id = v_subject;
  update public.member_trade_price_offers set seller_guild_member_id = v_member_id
   where guild_id = new.guild_id and seller_discord_id = v_subject;
  update public.member_trade_events set actor_guild_member_id = v_member_id
   where guild_id = new.guild_id and actor_discord_id = v_subject;
  update public.craft_tasks set crafter_guild_member_id = v_member_id
   where guild_id = new.guild_id and crafter_discord_id = v_subject;
  update public.craft_orders set posted_by_member_id = v_member_id
   where guild_id = new.guild_id and posted_by_discord_id = v_subject;
  update public.craft_orders set cancelled_by_member_id = v_member_id
   where guild_id = new.guild_id and cancelled_by_discord_id = v_subject;
  update public.member_exchange_restrictions set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.member_gameplay_video_uploads set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.alliance_content_participations set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.alliance_content_video_requirements set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.alliance_content_video_submissions set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.event_regear_policy_snapshots set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;

  -- Complete the same projection for the Release A event/regear owners.
  update public.slots set assigned_guild_member_id = v_member_id
   where guild_id = new.guild_id and assigned_discord_id = v_subject;
  update public.slots set requested_guild_member_id = v_member_id
   where guild_id = new.guild_id and requested_discord_id = v_subject;
  update public.event_tentative_signups set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.event_tentative_signup_snapshots set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.event_participation_closeout_entries set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.event_regear_participants set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;
  update public.regear_requests set guild_member_id = v_member_id
   where guild_id = new.guild_id and discord_id = v_subject;

  return new;
end;
$$;

drop trigger if exists guild_member_access_identity_operational_projection
  on public.guild_member_access_identities;
create trigger guild_member_access_identity_operational_projection
after insert or update of guild_member_id
on public.guild_member_access_identities
for each row execute function public.sync_operational_ownership_for_access_identity();

revoke all on function public.sync_operational_ownership_for_access_identity()
  from public, anon, authenticated, service_role;

-- Stable point summary. The legacy hot projection remains untouched; rows
-- linked to the same stable member are aggregated only at the read boundary.
create or replace view public.guild_member_point_balances_v1
with (security_invoker = true)
as
select
  balance.guild_id,
  balance.guild_member_id,
  coalesce(directory.discord_id, min(balance.discord_id)) as discord_id,
  sum(balance.balance)::bigint as balance,
  sum(balance.lifetime_earned)::bigint as lifetime_earned,
  sum(balance.lifetime_spent)::bigint as lifetime_spent,
  sum(balance.entries_count)::bigint as entries_count,
  max(balance.updated_at) as updated_at
from public.member_point_balances balance
left join public.guild_member_directory_v1 directory
  on directory.guild_id = balance.guild_id
 and directory.guild_member_id = balance.guild_member_id
group by
  balance.guild_id,
  balance.guild_member_id,
  directory.discord_id,
  case when balance.guild_member_id is null then balance.discord_id else null end;

revoke all on public.guild_member_point_balances_v1
  from public, anon, authenticated;
grant select on public.guild_member_point_balances_v1 to service_role;

create or replace function public.member_point_account_snapshot(
  p_guild_id uuid,
  p_subject_id text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_subject text := nullif(btrim(coalesce(p_subject_id, '')), '');
  v_member_id uuid;
  v_balance bigint := 0;
  v_earned bigint := 0;
  v_spent bigint := 0;
  v_entries bigint := 0;
  v_escrowed bigint := 0;
begin
  if p_guild_id is null or v_subject is null then
    return jsonb_build_object(
      'guildMemberId', null,
      'balance', 0,
      'lifetimeEarned', 0,
      'lifetimeSpent', 0,
      'entriesCount', 0,
      'escrowed', 0,
      'spendable', 0
    );
  end if;

  v_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(v_subject),
    v_subject
  );

  if v_member_id is null then
    select
      coalesce(balance.balance, 0),
      coalesce(balance.lifetime_earned, 0),
      coalesce(balance.lifetime_spent, 0),
      coalesce(balance.entries_count, 0)
    into v_balance, v_earned, v_spent, v_entries
    from public.member_point_balances balance
    where balance.guild_id = p_guild_id
      and balance.discord_id = v_subject;

    select coalesce(sum(held.amount), 0)
      into v_escrowed
      from (
        select escrow.amount::bigint
        from public.point_escrows escrow
        where escrow.guild_id = p_guild_id
          and escrow.discord_id = v_subject
          and escrow.status = 'held'
        union all
        select request.held_points::bigint
        from public.exchange_requests request
        where request.guild_id = p_guild_id
          and request.discord_id = v_subject
          and request.status = 'pending'
          and request.hold_status = 'held'
      ) held;
  else
    select
      coalesce(balance.balance, 0),
      coalesce(balance.lifetime_earned, 0),
      coalesce(balance.lifetime_spent, 0),
      coalesce(balance.entries_count, 0)
    into v_balance, v_earned, v_spent, v_entries
    from public.guild_member_point_balances_v1 balance
    where balance.guild_id = p_guild_id
      and balance.guild_member_id = v_member_id;

    select coalesce(sum(held.amount), 0)
      into v_escrowed
      from (
        select escrow.amount::bigint
        from public.point_escrows escrow
        where escrow.guild_id = p_guild_id
          and escrow.guild_member_id = v_member_id
          and escrow.status = 'held'
        union all
        select request.held_points::bigint
        from public.exchange_requests request
        where request.guild_id = p_guild_id
          and request.guild_member_id = v_member_id
          and request.status = 'pending'
          and request.hold_status = 'held'
      ) held;
  end if;

  return jsonb_build_object(
    'guildMemberId', v_member_id,
    'balance', coalesce(v_balance, 0),
    'lifetimeEarned', coalesce(v_earned, 0),
    'lifetimeSpent', coalesce(v_spent, 0),
    'entriesCount', coalesce(v_entries, 0),
    'escrowed', coalesce(v_escrowed, 0),
    'spendable', greatest(0, coalesce(v_balance, 0) - coalesce(v_escrowed, 0))
  );
end;
$$;

revoke all on function public.member_point_account_snapshot(uuid, text)
  from public, anon, authenticated;
grant execute on function public.member_point_account_snapshot(uuid, text)
  to service_role;

-- All write RPCs already call this balance function. Acquiring the stable
-- ownership lock here prevents two linked access identities from spending the
-- same balance concurrently.
create or replace function public.member_spendable_point_balance(
  p_guild_id uuid,
  p_discord_id text
) returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_snapshot jsonb;
begin
  v_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_discord_id),
    p_discord_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_guild_id::text || ':points:' || coalesce(v_member_id::text, p_discord_id),
    0
  ));
  v_snapshot := public.member_point_account_snapshot(p_guild_id, p_discord_id);
  return least(
    2147483647,
    greatest(0, coalesce((v_snapshot ->> 'spendable')::bigint, 0))
  )::integer;
end;
$$;

revoke all on function public.member_spendable_point_balance(uuid, text)
  from public, anon, authenticated;
grant execute on function public.member_spendable_point_balance(uuid, text)
  to service_role;

-- Preserve the public RPC signature while reading every access subject that
-- belongs to the same stable member. The original adapter remains internal.
alter function public.member_work_inbox_snapshot(uuid, text, boolean, integer)
  rename to member_work_inbox_snapshot_by_access_subject;

revoke all on function public.member_work_inbox_snapshot_by_access_subject(
  uuid, text, boolean, integer
) from public, anon, authenticated, service_role;

create or replace function public.member_work_inbox_snapshot(
  p_guild_id uuid,
  p_discord_id text,
  p_include_history boolean default true,
  p_history_limit integer default 50
) returns table (
  item_key text,
  domain text,
  source_id uuid,
  bucket text,
  stage text,
  status text,
  title text,
  amount bigint,
  unit text,
  created_at timestamptz,
  updated_at timestamptz,
  due_at timestamptz,
  href text,
  next_actor text,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_subject text := nullif(btrim(coalesce(p_discord_id, '')), '');
  v_member_id uuid;
begin
  if p_guild_id is null or v_subject is null then
    return;
  end if;

  v_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(v_subject),
    v_subject
  );

  if v_member_id is null then
    return query
    select snapshot.*
    from public.member_work_inbox_snapshot_by_access_subject(
      p_guild_id,
      v_subject,
      p_include_history,
      p_history_limit
    ) snapshot;
    return;
  end if;

  return query
  select deduplicated.item_key,
         deduplicated.domain,
         deduplicated.source_id,
         deduplicated.bucket,
         deduplicated.stage,
         deduplicated.status,
         deduplicated.title,
         deduplicated.amount,
         deduplicated.unit,
         deduplicated.created_at,
         deduplicated.updated_at,
         deduplicated.due_at,
         deduplicated.href,
         deduplicated.next_actor,
         deduplicated.metadata
  from (
    select distinct on (snapshot.item_key)
      snapshot.*,
      access.subject_id
    from public.guild_member_access_identities access
    cross join lateral public.member_work_inbox_snapshot_by_access_subject(
      p_guild_id,
      access.subject_id,
      p_include_history,
      p_history_limit
    ) snapshot
    where access.guild_id = p_guild_id
      and access.guild_member_id = v_member_id
    order by snapshot.item_key, (access.subject_id = v_subject) desc, access.subject_id
  ) deduplicated
  order by
    case deduplicated.bucket
      when 'action_required' then 0
      when 'waiting_on_guild' then 1
      else 2
    end,
    deduplicated.updated_at desc,
    deduplicated.item_key;
end;
$$;

revoke all on function public.member_work_inbox_snapshot(
  uuid, text, boolean, integer
) from public, anon, authenticated;
grant execute on function public.member_work_inbox_snapshot(
  uuid, text, boolean, integer
) to service_role;

comment on function public.member_work_inbox_snapshot(uuid, text, boolean, integer) is
  'Stable-member read adapter over all tenant-scoped access subjects; source mutations remain in their owning modules.';

-- Menhera video duties are accumulated by one stable guild member, even when
-- that member deliberately links another Discord access identity. Keep the
-- public compatibility signatures and historical Discord subjects, but use
-- the stable owner for grouping, locking, and requirement authorization.
create or replace function public.refresh_alliance_content_video_requirements(
  p_guild_id uuid,
  p_discord_id text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.alliance_content_policies%rowtype;
  v_batch record;
  v_requirement_id uuid;
  v_created integer := 0;
  v_member_id uuid;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  v_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_discord_id),
    p_discord_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_guild_id::text || ':alliance-content:'
      || coalesce(v_member_id::text, p_discord_id),
    0
  ));

  select *
    into v_policy
    from public.alliance_content_policies
   where guild_id = p_guild_id;

  if not found then
    raise exception 'ALLIANCE_CONTENT_POLICY_NOT_FOUND';
  end if;

  for v_batch in
    with member_sessions as (
      select distinct participation.session_id, session.ended_at
        from public.alliance_content_participations participation
        inner join public.alliance_content_sessions session
          on session.guild_id = participation.guild_id
         and session.id = participation.session_id
         and session.is_counted
       where participation.guild_id = p_guild_id
         and case when v_member_id is not null
           then participation.guild_member_id = v_member_id
           else participation.guild_member_id is null
             and participation.discord_id = p_discord_id
         end
    ), unassigned as (
      select
        member_session.session_id,
        member_session.ended_at,
        row_number() over (
          order by member_session.ended_at asc, member_session.session_id asc
        ) as ordinal
      from member_sessions member_session
      where not exists (
        select 1
          from public.alliance_content_video_requirement_sessions requirement_session
          inner join public.alliance_content_video_requirements requirement
            on requirement.guild_id = requirement_session.guild_id
           and requirement.id = requirement_session.requirement_id
         where requirement_session.guild_id = p_guild_id
           and requirement_session.session_id = member_session.session_id
           and case when v_member_id is not null
             then requirement.guild_member_id = v_member_id
             else requirement.guild_member_id is null
               and requirement.discord_id = p_discord_id
           end
      )
    ), grouped as (
      select
        floor((ordinal - 1) / v_policy.video_every_sessions)::integer as batch_number,
        array_agg(session_id order by ended_at asc, session_id asc) as session_ids,
        max(ended_at) as completed_at,
        count(*) as session_count
      from unassigned
      group by floor((ordinal - 1) / v_policy.video_every_sessions)
    )
    select session_ids, completed_at
      from grouped
     where session_count = v_policy.video_every_sessions
     order by batch_number asc
  loop
    insert into public.alliance_content_video_requirements (
      guild_id,
      discord_id,
      due_at
    ) values (
      p_guild_id,
      p_discord_id,
      v_batch.completed_at + make_interval(days => v_policy.video_due_days)
    )
    returning id into v_requirement_id;

    insert into public.alliance_content_video_requirement_sessions (
      guild_id,
      requirement_id,
      session_id
    )
    select p_guild_id, v_requirement_id, session_id
      from unnest(v_batch.session_ids) as session_id;

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

create or replace function public.rebuild_alliance_content_open_video_requirements(
  p_guild_id uuid,
  p_discord_id text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
  v_member_id uuid;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  v_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_discord_id),
    p_discord_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_guild_id::text || ':alliance-content:'
      || coalesce(v_member_id::text, p_discord_id),
    0
  ));

  delete from public.alliance_content_video_requirements requirement
   where requirement.guild_id = p_guild_id
     and requirement.status in ('open', 'overdue')
     and case when v_member_id is not null
       then requirement.guild_member_id = v_member_id
       else requirement.guild_member_id is null
         and requirement.discord_id = p_discord_id
     end
     and not exists (
       select 1
         from public.alliance_content_video_submissions submission
        where submission.guild_id = requirement.guild_id
          and submission.requirement_id = requirement.id
     );
  get diagnostics v_deleted = row_count;

  perform public.refresh_alliance_content_video_requirements(
    p_guild_id,
    p_discord_id
  );
  return v_deleted;
end;
$$;

create or replace function public.submit_alliance_content_video(
  p_guild_id uuid,
  p_requirement_id uuid,
  p_session_id uuid,
  p_discord_id text,
  p_youtube_video_id text,
  p_video_url text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.alliance_content_video_requirements%rowtype;
  v_submission_id uuid;
  v_member_id uuid;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE';
  end if;

  if p_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$'
     or p_video_url !~ '^https://www[.]youtube[.]com/embed/[A-Za-z0-9_-]{11}$' then
    raise exception 'ALLIANCE_CONTENT_INVALID_VIDEO';
  end if;

  v_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_discord_id),
    p_discord_id
  );

  select requirement.*
    into v_requirement
    from public.alliance_content_video_requirements requirement
   where requirement.id = p_requirement_id
     and requirement.guild_id = p_guild_id
     and case when v_member_id is not null
       then requirement.guild_member_id = v_member_id
       else requirement.guild_member_id is null
         and requirement.discord_id = p_discord_id
     end
   for update;

  if not found then
    raise exception 'ALLIANCE_CONTENT_REQUIREMENT_NOT_FOUND';
  end if;

  if v_requirement.status not in ('open', 'overdue')
     or v_requirement.due_at < now() then
    raise exception 'ALLIANCE_CONTENT_VIDEO_DEADLINE_PASSED';
  end if;

  if not exists (
    select 1
      from public.alliance_content_video_requirement_sessions requirement_session
     where requirement_session.guild_id = p_guild_id
       and requirement_session.requirement_id = p_requirement_id
       and requirement_session.session_id = p_session_id
  ) then
    raise exception 'ALLIANCE_CONTENT_SESSION_NOT_IN_REQUIREMENT';
  end if;

  insert into public.alliance_content_video_submissions (
    guild_id,
    requirement_id,
    session_id,
    discord_id,
    youtube_video_id,
    video_url
  ) values (
    p_guild_id,
    p_requirement_id,
    p_session_id,
    p_discord_id,
    p_youtube_video_id,
    p_video_url
  )
  returning id into v_submission_id;

  update public.alliance_content_video_requirements
     set status = 'submitted',
         updated_at = now()
   where guild_id = p_guild_id
     and id = p_requirement_id;

  return v_submission_id;
end;
$$;

create or replace function public.submit_member_gameplay_video(
  p_guild_id uuid,
  p_discord_id text,
  p_youtube_video_id text,
  p_video_url text,
  p_reflection_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_id uuid;
  v_reflection_note text := nullif(btrim(p_reflection_note), '');
  v_member_id uuid;
begin
  if not public.alliance_content_compliance_enabled(p_guild_id) then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_FEATURE_UNAVAILABLE';
  end if;

  if p_discord_id is null
     or length(btrim(p_discord_id)) = 0
     or char_length(p_discord_id) > 128
     or p_discord_id like 'local:%' then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_MEMBER_NOT_FOUND';
  end if;

  perform 1
    from public.guild_avatars avatar
   where avatar.guild_id = p_guild_id
     and avatar.discord_id = p_discord_id
     and avatar.withdrawn_at is null;
  if not found then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_MEMBER_NOT_FOUND';
  end if;

  v_member_id := public.resolve_guild_member_id(
    p_guild_id,
    'discord',
    p_discord_id
  );
  if v_member_id is null then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_MEMBER_NOT_FOUND';
  end if;

  if p_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$'
     or p_video_url <> 'https://www.youtube.com/embed/' || p_youtube_video_id then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_INVALID_URL';
  end if;

  if v_reflection_note is not null and char_length(v_reflection_note) > 300 then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_REFLECTION_TOO_LONG';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_guild_id::text || ':gameplay-video:' || v_member_id::text,
    0
  ));

  if exists (
    select 1
      from public.member_gameplay_video_uploads upload
     where upload.guild_id = p_guild_id
       and upload.guild_member_id = v_member_id
       and upload.created_at > now() - interval '1 minute'
  ) then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_RATE_LIMITED';
  end if;

  insert into public.member_gameplay_video_uploads (
    guild_id,
    discord_id,
    youtube_video_id,
    video_url,
    reflection_note
  ) values (
    p_guild_id,
    p_discord_id,
    p_youtube_video_id,
    p_video_url,
    v_reflection_note
  )
  returning id into v_upload_id;

  return v_upload_id;
exception
  when unique_violation then
    raise exception 'MEMBER_GAMEPLAY_VIDEO_ALREADY_USED';
end;
$$;

create or replace function public.submit_member_gameplay_video(
  p_guild_id uuid,
  p_discord_id text,
  p_youtube_video_id text,
  p_video_url text
) returns uuid
language sql
security definer
set search_path = public
as $$
  select public.submit_member_gameplay_video(
    p_guild_id,
    p_discord_id,
    p_youtube_video_id,
    p_video_url,
    null
  );
$$;

revoke all on function public.refresh_alliance_content_video_requirements(uuid, text)
  from public, anon, authenticated;
grant execute on function public.refresh_alliance_content_video_requirements(uuid, text)
  to service_role;
revoke all on function public.rebuild_alliance_content_open_video_requirements(uuid, text)
  from public, anon, authenticated;
grant execute on function public.rebuild_alliance_content_open_video_requirements(uuid, text)
  to service_role;
revoke all on function public.submit_alliance_content_video(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_alliance_content_video(uuid, uuid, uuid, text, text, text)
  to service_role;
revoke all on function public.submit_member_gameplay_video(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_member_gameplay_video(uuid, text, text, text, text)
  to service_role;
revoke all on function public.submit_member_gameplay_video(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_member_gameplay_video(uuid, text, text, text)
  to service_role;

-- The Menhera exchange gate follows the same stable member after a local
-- account is linked to Discord. The setting remains tenant-scoped and the
-- five-day rule is otherwise unchanged.
create or replace function public.guard_member_exchange_restriction()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_blocked_until timestamptz;
  v_member_id uuid;
begin
  v_member_id := public.resolve_guild_member_id(
    new.guild_id,
    public.guild_member_access_identity_type(new.discord_id),
    new.discord_id
  );

  select restriction.blocked_until
    into v_blocked_until
    from public.member_exchange_restrictions restriction
   where restriction.guild_id = new.guild_id
     and (
       (v_member_id is not null and restriction.guild_member_id = v_member_id)
       or (
         v_member_id is null
         and restriction.guild_member_id is null
         and restriction.discord_id = new.discord_id
       )
     )
     and restriction.blocked_until > now()
   order by restriction.blocked_until desc
   limit 1;

  if v_blocked_until is not null then
    raise exception 'EXCHANGE_TEMPORARILY_RESTRICTED:%', v_blocked_until;
  end if;

  if public.alliance_content_compliance_enabled(new.guild_id)
     and coalesce((
       select setting.value <> 'false'
         from public.app_settings setting
        where setting.guild_id = new.guild_id
          and setting.key = 'exchange_recent_gameplay_video_required'
     ), true)
     and not exists (
       select 1
         from public.member_gameplay_video_uploads upload
        where upload.guild_id = new.guild_id
          and (
            (v_member_id is not null and upload.guild_member_id = v_member_id)
            or (
              v_member_id is null
              and upload.guild_member_id is null
              and upload.discord_id = new.discord_id
            )
          )
          and upload.status = 'submitted'
          and upload.uploaded_at >= now() - interval '5 days'
     ) then
    raise exception 'EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_member_exchange_restriction()
  from public, anon, authenticated, service_role;

create index if not exists exchange_requests_stable_pending_idx
  on public.exchange_requests (guild_id, guild_member_id)
  where guild_member_id is not null and status = 'pending';
create index if not exists donation_requests_stable_pending_idx
  on public.donation_requests (guild_id, guild_member_id)
  where guild_member_id is not null and status = 'pending';

-- Keep one pending exchange per stable member even when two access subjects
-- are linked. The stable advisory lock makes the check concurrency-safe
-- without rejecting pre-existing duplicate history during migration.
create or replace function public.submit_exchange_request(
  p_guild_id uuid,
  p_discord_id text,
  p_username text,
  p_silver integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_spendable integer;
  v_member_id uuid;
begin
  if p_guild_id is null
     or nullif(btrim(coalesce(p_discord_id, '')), '') is null
     or nullif(btrim(coalesce(p_username, '')), '') is null then
    raise exception 'EXCHANGE_ACTOR_REQUIRED' using errcode = '22023';
  end if;
  if p_silver is null or p_silver <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if char_length(p_username) > 100 then
    raise exception 'EXCHANGE_USERNAME_TOO_LONG' using errcode = '22023';
  end if;

  v_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_discord_id),
    p_discord_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_guild_id::text || ':points:' || coalesce(v_member_id::text, p_discord_id),
    0
  ));

  if not exists (
    select 1
      from public.guild_avatars avatar
     where avatar.guild_id = p_guild_id
       and avatar.discord_id = p_discord_id
       and avatar.withdrawn_at is null
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if exists (
    select 1
      from public.exchange_requests request
     where request.guild_id = p_guild_id
       and request.status = 'pending'
       and (
         (v_member_id is not null and request.guild_member_id = v_member_id)
         or (
           v_member_id is null
           and request.guild_member_id is null
           and request.discord_id = p_discord_id
         )
       )
  ) then
    raise exception 'PENDING_EXCHANGE_EXISTS';
  end if;

  v_spendable := public.member_spendable_point_balance(p_guild_id, p_discord_id);
  if v_spendable < p_silver then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.exchange_requests (
    guild_id,
    discord_id,
    username,
    silver,
    held_points,
    hold_status,
    held_at
  ) values (
    p_guild_id,
    p_discord_id,
    btrim(p_username),
    p_silver,
    p_silver,
    'held',
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_exchange_request(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.submit_exchange_request(uuid, text, text, integer)
  to service_role;

-- Payout validation aggregates the entire stable member balance, while the
-- compatibility ledger row keeps the original request subject for audit.
create or replace function public.approve_exchange_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.exchange_requests%rowtype;
  v_snapshot jsonb;
  v_balance bigint;
  v_spendable integer;
begin
  select *
    into v_request
    from public.exchange_requests request
   where request.id = p_id
     and request.guild_id = p_guild_id
     and request.status = 'pending';
  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_guild_id::text || ':points:'
      || coalesce(v_request.guild_member_id::text, v_request.discord_id),
    0
  ));

  select *
    into v_request
    from public.exchange_requests request
   where request.id = p_id
     and request.guild_id = p_guild_id
     and request.status = 'pending'
   for update;
  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  v_snapshot := public.member_point_account_snapshot(
    p_guild_id,
    v_request.discord_id
  );
  v_balance := coalesce((v_snapshot ->> 'balance')::bigint, 0);

  if v_request.hold_status = 'held'
     and v_request.held_points = v_request.silver then
    if v_balance < v_request.silver then
      raise exception 'INSUFFICIENT_BALANCE';
    end if;
  else
    v_spendable := public.member_spendable_point_balance(
      p_guild_id,
      v_request.discord_id
    );
    if v_spendable < v_request.silver then
      raise exception 'INSUFFICIENT_BALANCE';
    end if;
  end if;

  update public.exchange_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username,
         held_points = 0,
         hold_status = 'consumed',
         hold_resolved_at = now()
   where id = p_id
     and guild_id = p_guild_id;

  insert into public.point_ledger (
    guild_id,
    discord_id,
    delta,
    reason,
    ref_id,
    handled_by,
    handled_by_username
  ) values (
    p_guild_id,
    v_request.discord_id,
    -v_request.silver,
    'exchange_paid',
    p_id,
    p_admin_id,
    p_admin_username
  );
end;
$$;

revoke all on function public.approve_exchange_request(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_exchange_request(uuid, text, text, uuid)
  to service_role;

create or replace function public.member_pending_request_counts(
  p_guild_id uuid,
  p_discord_id text
) returns table (
  regear bigint,
  exchange bigint,
  donation bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  v_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_discord_id),
    p_discord_id
  );

  return query select
    (select count(*)::bigint
       from public.regear_requests request
      where request.guild_id = p_guild_id
        and request.status = 'pending'
        and case when v_member_id is not null
          then request.guild_member_id = v_member_id
          else request.guild_member_id is null and request.discord_id = p_discord_id
        end),
    (select count(*)::bigint
       from public.exchange_requests request
      where request.guild_id = p_guild_id
        and request.status = 'pending'
        and case when v_member_id is not null
          then request.guild_member_id = v_member_id
          else request.guild_member_id is null and request.discord_id = p_discord_id
        end),
    (select count(*)::bigint
       from public.donation_requests request
      where request.guild_id = p_guild_id
        and request.status = 'pending'
        and case when v_member_id is not null
          then request.guild_member_id = v_member_id
          else request.guild_member_id is null and request.discord_id = p_discord_id
        end);
end;
$$;

revoke all on function public.member_pending_request_counts(uuid, text)
  from public, anon, authenticated;
grant execute on function public.member_pending_request_counts(uuid, text)
  to service_role;

-- Migration 335 already binds the fulfillment to a stable crafter member, but
-- its compatibility task predicates still compare the original Discord
-- subject. Patch only those two predicates so a deliberately linked access
-- identity can finish the same atomic delivery command. Confirmation and
-- idempotency actors remain the current authenticated subject.
do $$
declare
  v_sql text;
  v_next_sql text;
begin
  select pg_get_functiondef(
    'public.execute_supply_craft_delivery(uuid,uuid,text,text,text,text,jsonb,jsonb,uuid)'::regprocedure
  ) into v_sql;

  if v_sql is null then
    raise exception 'SUPPLY_CRAFT_DELIVERY_FUNCTION_MISSING';
  end if;

  v_next_sql := replace(
    v_sql,
    $old$
  select task.*
    into v_task
    from public.craft_tasks task
$old$,
    $new$
  v_actor_member_id := public.resolve_guild_member_id(
    p_guild_id,
    public.guild_member_access_identity_type(p_actor_discord_id),
    p_actor_discord_id
  );

  select task.*
    into v_task
    from public.craft_tasks task
$new$
  );
  if v_next_sql = v_sql then
    raise exception 'SUPPLY_CRAFT_DELIVERY_ACTOR_PROJECTION_PATCH_NOT_APPLIED';
  end if;

  v_sql := v_next_sql;
  v_next_sql := replace(
    v_sql,
    $old$
     and task.crafter_discord_id = p_actor_discord_id
$old$,
    $new$
     and (
       (v_actor_member_id is not null
        and task.crafter_guild_member_id = v_actor_member_id)
       or (
         task.crafter_guild_member_id is null
         and task.crafter_discord_id = p_actor_discord_id
       )
     )
$new$
  );
  if v_next_sql = v_sql then
    raise exception 'SUPPLY_CRAFT_DELIVERY_SELECT_OWNER_PATCH_NOT_APPLIED';
  end if;

  v_sql := v_next_sql;
  v_next_sql := replace(
    v_sql,
    $old$
     and crafter_discord_id = p_actor_discord_id;
$old$,
    $new$
     and (
       (v_actor_member_id is not null
        and crafter_guild_member_id = v_actor_member_id)
       or (
         crafter_guild_member_id is null
         and crafter_discord_id = p_actor_discord_id
       )
     );
$new$
  );
  if v_next_sql = v_sql then
    raise exception 'SUPPLY_CRAFT_DELIVERY_UPDATE_OWNER_PATCH_NOT_APPLIED';
  end if;

  execute v_next_sql;
end;
$$;

revoke all on function public.execute_supply_craft_delivery(
  uuid, uuid, text, text, text, text, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.execute_supply_craft_delivery(
  uuid, uuid, text, text, text, text, jsonb, jsonb, uuid
) to service_role;
