-- 089: shop_inventory 자동 삭제 트리거 + 카테고리별 이벤트 생성 역할 백필
--
-- 두 가지 변경을 묶어 한 마이그레이션으로:
--
-- 1) 길드상점 아이템의 stock 이 0 이하로 떨어지면 행 자체를 삭제. 그러면
--    /shop 목록과 admin/dashboard/shop 인벤토리 양쪽에서 자동으로 사라진다.
--    기존엔 stock=0 인 행이 그대로 남아 "구매 불가" 상태로 노출돼 혼란.
--
--    트리거는 AFTER UPDATE OF stock — approve_shop_order RPC 와 chest log
--    배치 모두 stock 컬럼만 UPDATE 하므로 한 곳에서 처리. shop_order_items
--    는 inventory_id FK 가 없어 cascade 문제 없음.
--
-- 2) Phase: event_creator_role_ids_{combat,ff,ganking} 3 신규 키. 기존
--    legacy event_creator_role_ids 가 채워져 있던 tenant 는 같은 값을 3개
--    카테고리에 복제 — 백필. 비어있던 tenant 는 그대로 빈 배열 (admin 전용).

-- ───── shop_inventory auto-delete ─────
create or replace function public.shop_inventory_delete_when_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.stock <= 0 then
    delete from public.shop_inventory where id = NEW.id;
  end if;
  return null;
end;
$$;

drop trigger if exists shop_inventory_delete_when_empty_t on public.shop_inventory;
create trigger shop_inventory_delete_when_empty_t
  after update of stock on public.shop_inventory
  for each row
  when (NEW.stock <= 0)
  execute function public.shop_inventory_delete_when_empty();

-- 기존에 stock=0 인 행 정리. 트리거는 UPDATE 에서만 발화하므로 여기서 한 번 청소.
delete from public.shop_inventory where stock <= 0;

-- ───── event creator role per-category backfill ─────
-- 기존 legacy 키가 채워져 있던 tenant 별로 같은 JSON array 값을 3개 카테고리
-- 키에 복제. 이미 카테고리 키가 있는 tenant 는 건드리지 않음 (ON CONFLICT DO NOTHING).
insert into public.app_settings (guild_id, key, value, updated_at)
select s.guild_id, k.new_key, s.value, now()
from public.app_settings s
cross join (
  values
    ('event_creator_role_ids_combat'),
    ('event_creator_role_ids_ff'),
    ('event_creator_role_ids_ganking')
) as k(new_key)
where s.key = 'event_creator_role_ids'
  and s.value is not null
  and s.value <> ''
  and s.value <> '[]'
on conflict (guild_id, key) do nothing;
