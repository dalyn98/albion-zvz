-- 236: Resolve special guild-shop item names omitted from the trimmed bundle.
--
-- These rows were imported into shop_chest_logs with unique_name = null, so
-- they were preserved for audit but skipped by shop_inventory replay. Backfill
-- the canonical UniqueName and apply only current-epoch rows to inventory.

do $$
declare
  v_delta record;
begin
  create temporary table shop_special_item_resolution (
    item_name_raw text primary key,
    unique_name text not null,
    category text not null,
    tier integer
  ) on commit drop;

  insert into shop_special_item_resolution (
    item_name_raw,
    unique_name,
    category,
    tier
  ) values
    ('유령의 박쥐', 'UNIQUE_MOUNT_BAT_PERSONAL', 'mount', null),
    ('실버 방랑하는 요새', 'UNIQUE_MOUNT_BASTION_SILVER', 'mount', null),
    ('크리스탈 방랑하는 요새', 'UNIQUE_MOUNT_BASTION_CRYSTAL', 'mount', null),
    ('골드 방랑하는 요새', 'UNIQUE_MOUNT_BASTION_GOLD', 'mount', null),
    ('모르가나의 까마귀', 'UNIQUE_MOUNT_MORGANA_RAVEN_ADC', 'mount', null),
    ('블랙 팬서', 'UNIQUE_MOUNT_BLACK_PANTHER_ADC', 'mount', null),
    ('은신처 건설키트', 'UNIQUE_HIDEOUT', 'other', null);

  create temporary table shop_special_item_log_fix (
    id uuid primary key,
    guild_id uuid not null,
    unique_name text not null,
    category text not null,
    tier integer,
    enchant integer not null,
    item_name_raw text not null,
    stock_delta integer not null,
    logged_at timestamptz not null,
    imported_at timestamptz not null,
    import_sequence integer,
    should_apply boolean not null
  ) on commit drop;

  insert into shop_special_item_log_fix (
    id,
    guild_id,
    unique_name,
    category,
    tier,
    enchant,
    item_name_raw,
    stock_delta,
    logged_at,
    imported_at,
    import_sequence,
    should_apply
  )
  select l.id,
         l.guild_id,
         r.unique_name,
         r.category,
         r.tier,
         l.enchant,
         l.item_name_raw,
         coalesce(l.applied_quantity, l.quantity)::integer as stock_delta,
         l.logged_at,
         l.imported_at,
         l.import_sequence,
         (
           (b.baseline_at is null or l.logged_at > b.baseline_at)
           and not exists (
             select 1
               from public.shop_blacklist bl
              where bl.guild_id = l.guild_id
                and bl.item_name_raw = l.item_name_raw
           )
         ) as should_apply
    from public.shop_chest_logs l
    join shop_special_item_resolution r
      on r.item_name_raw = l.item_name_raw
    left join lateral (
      select baseline_at
        from public.shop_baselines b
       where b.guild_id = l.guild_id
         and b.status = 'confirmed'
       order by b.baseline_at desc, b.confirmed_at desc
       limit 1
    ) b on true
   where l.unique_name is null;

  update public.shop_chest_logs l
     set unique_name = f.unique_name
    from shop_special_item_log_fix f
   where l.id = f.id
     and l.guild_id = f.guild_id;

  for v_delta in
    select guild_id,
           unique_name,
           category,
           tier,
           enchant,
           item_name_raw,
           stock_delta
      from shop_special_item_log_fix
     where should_apply
       and stock_delta <> 0
     order by logged_at asc,
              imported_at asc,
              import_sequence asc nulls last,
              item_name_raw asc,
              id asc
  loop
    perform public.apply_shop_stock_delta(
      v_delta.guild_id,
      v_delta.unique_name,
      v_delta.enchant,
      1,
      v_delta.stock_delta,
      v_delta.item_name_raw,
      v_delta.category,
      v_delta.tier
    );
  end loop;
end $$;
