-- 188: Preserve member price quotes on shop orders.
--
-- Member-entered prices are review hints, not trusted shop prices. Priced
-- items keep the catalog total unless an admin explicitly approves an adjusted
-- total. Unpriced items may use a member quote as the pending order amount so
-- the admin has a concrete value to review.

alter table public.shop_orders
  add column if not exists price_review_required boolean not null default false;

alter table public.shop_order_items
  add column if not exists pricing_source text not null default 'catalog',
  add column if not exists catalog_unit_silver_snapshot integer,
  add column if not exists member_quote_unit_silver integer,
  add column if not exists member_quote_unit_points integer,
  add column if not exists member_quote_city text,
  add column if not exists member_quote_note text,
  add column if not exists member_quote_evidence_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shop_order_items_pricing_source_check'
  ) then
    alter table public.shop_order_items
      add constraint shop_order_items_pricing_source_check
      check (pricing_source in ('catalog', 'member_quote'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_order_items_catalog_unit_silver_snapshot_check'
  ) then
    alter table public.shop_order_items
      add constraint shop_order_items_catalog_unit_silver_snapshot_check
      check (catalog_unit_silver_snapshot is null or catalog_unit_silver_snapshot >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_order_items_member_quote_unit_silver_check'
  ) then
    alter table public.shop_order_items
      add constraint shop_order_items_member_quote_unit_silver_check
      check (member_quote_unit_silver is null or member_quote_unit_silver > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_order_items_member_quote_unit_points_check'
  ) then
    alter table public.shop_order_items
      add constraint shop_order_items_member_quote_unit_points_check
      check (member_quote_unit_points is null or member_quote_unit_points > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_order_items_member_quote_city_length_check'
  ) then
    alter table public.shop_order_items
      add constraint shop_order_items_member_quote_city_length_check
      check (member_quote_city is null or char_length(member_quote_city) <= 40);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_order_items_member_quote_note_length_check'
  ) then
    alter table public.shop_order_items
      add constraint shop_order_items_member_quote_note_length_check
      check (member_quote_note is null or char_length(member_quote_note) <= 200);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_order_items_member_quote_evidence_url_check'
  ) then
    alter table public.shop_order_items
      add constraint shop_order_items_member_quote_evidence_url_check
      check (
        member_quote_evidence_url is null
        or (
          char_length(member_quote_evidence_url) <= 300
          and member_quote_evidence_url ~* '^https?://'
        )
      );
  end if;
end $$;

create index if not exists shop_orders_price_review_pending_idx
  on public.shop_orders (guild_id, status, created_at desc)
  where price_review_required = true;

drop function if exists public.submit_shop_order(uuid, text, text, integer, text, jsonb);

create or replace function public.submit_shop_order(
  p_guild_id uuid,
  p_discord_id text,
  p_username text,
  p_total_points integer,
  p_member_note text,
  p_price_review_required boolean,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if p_guild_id is null then
    raise exception 'GUILD_REQUIRED';
  end if;
  if p_discord_id is null or btrim(p_discord_id) = '' then
    raise exception 'DISCORD_REQUIRED';
  end if;
  if p_total_points is null or p_total_points <= 0 then
    raise exception 'TOTAL_POINTS_NOT_POSITIVE';
  end if;
  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'LINES_EMPTY';
  end if;

  insert into public.shop_orders (
    guild_id,
    discord_id,
    username,
    total_points,
    status,
    member_note,
    price_review_required
  ) values (
    p_guild_id,
    p_discord_id,
    p_username,
    p_total_points,
    'pending',
    nullif(btrim(coalesce(p_member_note, '')), ''),
    coalesce(p_price_review_required, false)
  )
  returning id into v_order_id;

  insert into public.shop_order_items (
    guild_id,
    order_id,
    unique_name,
    enchant,
    quality,
    name_ko,
    quantity,
    unit_points,
    subtotal_points,
    pricing_source,
    catalog_unit_silver_snapshot,
    member_quote_unit_silver,
    member_quote_unit_points,
    member_quote_city,
    member_quote_note,
    member_quote_evidence_url
  )
  select
    p_guild_id,
    v_order_id,
    l->>'unique_name',
    (l->>'enchant')::int,
    (l->>'quality')::int,
    l->>'name_ko',
    (l->>'quantity')::int,
    (l->>'unit_points')::int,
    (l->>'subtotal_points')::int,
    coalesce(nullif(l->>'pricing_source', ''), 'catalog'),
    nullif(l->>'catalog_unit_silver_snapshot', '')::int,
    nullif(l->>'member_quote_unit_silver', '')::int,
    nullif(l->>'member_quote_unit_points', '')::int,
    nullif(btrim(coalesce(l->>'member_quote_city', '')), ''),
    nullif(btrim(coalesce(l->>'member_quote_note', '')), ''),
    nullif(btrim(coalesce(l->>'member_quote_evidence_url', '')), '')
  from jsonb_array_elements(p_lines) as l;

  return v_order_id;
end;
$$;

comment on function public.submit_shop_order(uuid, text, text, integer, text, boolean, jsonb) is
  '길드원 상점 주문 제출. 멤버 가격 제안은 주문 라인에 보존하며 최종 가격 확정은 관리자 승인 RPC 에서 처리한다.';

revoke all on function public.submit_shop_order(uuid, text, text, integer, text, boolean, jsonb) from public;
revoke all on function public.submit_shop_order(uuid, text, text, integer, text, boolean, jsonb) from anon, authenticated;
grant execute on function public.submit_shop_order(uuid, text, text, integer, text, boolean, jsonb) to service_role;
