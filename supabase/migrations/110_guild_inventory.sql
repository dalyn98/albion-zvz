-- Guild inventory (Phase 1): refined materials + finished gear stock per tenant.
--
-- Phase 1 = manual admin adjustment only. No automatic +1/-1 hooks tied to
-- craft delivery / regear collection — those land in Phase 2 once the manual
-- baseline proves out.
--
-- Schema split rationale:
--   * Materials use a structured (type, tier, enchantment) PK because the
--     domain has a small, finite set of refined SKUs (~5 types × 5 tiers × 4
--     ench = 100 max). Querying "all T8 cloth" stays cheap.
--   * Finished gear uses raw item_id (e.g. "T8_2H_FIRESTAFF@3") because the
--     item space is huge and unstructured. We let the picker (search) decide
--     which IDs ever land in inventory, and just count by id.
--
-- All quantities are non-negative integers. RPCs enforce floor=0 on
-- decrement so a stock can never go negative. Service-role only RLS
-- (consistent with craft_tasks etc).

-- ────────────────────────────────────────────────────────────
-- 1) Materials table
-- ────────────────────────────────────────────────────────────
create table if not exists public.guild_inventory_materials (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  material_type text not null
    check (material_type in ('METALBAR', 'PLANKS', 'LEATHER', 'CLOTH', 'STONEBLOCK')),
  tier integer not null check (tier between 4 and 8),
  enchantment integer not null default 0 check (enchantment between 0 and 4),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  updated_by_discord_id text,
  unique (guild_id, material_type, tier, enchantment)
);

create index if not exists idx_inventory_materials_guild
  on public.guild_inventory_materials (guild_id);

-- ────────────────────────────────────────────────────────────
-- 2) Finished gear table
-- ────────────────────────────────────────────────────────────
create table if not exists public.guild_inventory_gear (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  -- Full Albion id including @enchant suffix when applicable. Quality is NOT
  -- tracked separately — operators normalize to a single canonical quality
  -- per id (typically Outstanding / 4) when adding to stock.
  item_id text not null,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  updated_by_discord_id text,
  unique (guild_id, item_id)
);

create index if not exists idx_inventory_gear_guild
  on public.guild_inventory_gear (guild_id);

-- ────────────────────────────────────────────────────────────
-- 3) RPC: adjust_inventory_material — relative delta (+/-)
-- ────────────────────────────────────────────────────────────
-- Idempotent upsert. New row created with delta as initial qty (clamped to 0
-- if delta is negative, since we have no prior stock to subtract from).
create or replace function public.adjust_inventory_material(
  p_guild_id uuid,
  p_material_type text,
  p_tier integer,
  p_enchantment integer,
  p_delta integer,
  p_actor_discord_id text
) returns integer language plpgsql security definer as $$
declare
  v_new_qty integer;
begin
  if p_delta = 0 then
    raise exception 'INVENTORY_DELTA_ZERO';
  end if;

  insert into guild_inventory_materials
    (guild_id, material_type, tier, enchantment, quantity, updated_by_discord_id)
  values
    (p_guild_id, p_material_type, p_tier, p_enchantment, greatest(p_delta, 0), p_actor_discord_id)
  on conflict (guild_id, material_type, tier, enchantment)
  do update set
    quantity = greatest(guild_inventory_materials.quantity + p_delta, 0),
    updated_at = now(),
    updated_by_discord_id = p_actor_discord_id
  returning quantity into v_new_qty;

  return v_new_qty;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 4) RPC: set_inventory_material — absolute set
-- ────────────────────────────────────────────────────────────
create or replace function public.set_inventory_material(
  p_guild_id uuid,
  p_material_type text,
  p_tier integer,
  p_enchantment integer,
  p_quantity integer,
  p_actor_discord_id text
) returns integer language plpgsql security definer as $$
begin
  if p_quantity < 0 then
    raise exception 'INVENTORY_QTY_NEGATIVE';
  end if;

  insert into guild_inventory_materials
    (guild_id, material_type, tier, enchantment, quantity, updated_by_discord_id)
  values
    (p_guild_id, p_material_type, p_tier, p_enchantment, p_quantity, p_actor_discord_id)
  on conflict (guild_id, material_type, tier, enchantment)
  do update set
    quantity = p_quantity,
    updated_at = now(),
    updated_by_discord_id = p_actor_discord_id;

  return p_quantity;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 5) RPC: adjust_inventory_gear — relative delta (+/-)
-- ────────────────────────────────────────────────────────────
create or replace function public.adjust_inventory_gear(
  p_guild_id uuid,
  p_item_id text,
  p_delta integer,
  p_actor_discord_id text
) returns integer language plpgsql security definer as $$
declare
  v_new_qty integer;
begin
  if p_delta = 0 then
    raise exception 'INVENTORY_DELTA_ZERO';
  end if;
  if p_item_id is null or length(trim(p_item_id)) = 0 then
    raise exception 'INVENTORY_ITEM_ID_EMPTY';
  end if;

  insert into guild_inventory_gear
    (guild_id, item_id, quantity, updated_by_discord_id)
  values
    (p_guild_id, p_item_id, greatest(p_delta, 0), p_actor_discord_id)
  on conflict (guild_id, item_id)
  do update set
    quantity = greatest(guild_inventory_gear.quantity + p_delta, 0),
    updated_at = now(),
    updated_by_discord_id = p_actor_discord_id
  returning quantity into v_new_qty;

  return v_new_qty;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 6) RPC: set_inventory_gear — absolute set
-- ────────────────────────────────────────────────────────────
create or replace function public.set_inventory_gear(
  p_guild_id uuid,
  p_item_id text,
  p_quantity integer,
  p_actor_discord_id text
) returns integer language plpgsql security definer as $$
begin
  if p_quantity < 0 then
    raise exception 'INVENTORY_QTY_NEGATIVE';
  end if;
  if p_item_id is null or length(trim(p_item_id)) = 0 then
    raise exception 'INVENTORY_ITEM_ID_EMPTY';
  end if;

  insert into guild_inventory_gear
    (guild_id, item_id, quantity, updated_by_discord_id)
  values
    (p_guild_id, p_item_id, p_quantity, p_actor_discord_id)
  on conflict (guild_id, item_id)
  do update set
    quantity = p_quantity,
    updated_at = now(),
    updated_by_discord_id = p_actor_discord_id;

  return p_quantity;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 7) RLS — service-role only (admin client mediates writes)
-- ────────────────────────────────────────────────────────────
alter table public.guild_inventory_materials enable row level security;
drop policy if exists guild_inventory_materials_service_only on public.guild_inventory_materials;
create policy guild_inventory_materials_service_only on public.guild_inventory_materials
  for all to public using (false) with check (false);

alter table public.guild_inventory_gear enable row level security;
drop policy if exists guild_inventory_gear_service_only on public.guild_inventory_gear;
create policy guild_inventory_gear_service_only on public.guild_inventory_gear
  for all to public using (false) with check (false);
