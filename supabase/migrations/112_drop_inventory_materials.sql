-- 정련 재료 (refined materials) 인벤토리 트래킹을 폐기.
--
-- 인게임에 자동 연동이 없어 정확한 수량을 맞추려면 사용자가 재료를 두 번
-- 입력하는 셈이라 ROI 가 마이너스. 길드 운영 입장에서 진짜 의미 있는 단위
-- 는 "지금 보유한 완제품 장비" 라서 그쪽 (guild_inventory_gear / 110) 만
-- 남기고 재료 측은 테이블 + RPC 까지 통째로 제거.
--
-- 이 마이그가 적용되기 전에 이미 src/lib/inventory.ts / actions/inventory.ts
-- 에서 재료 관련 코드를 떼어내고 admin/dashboard/inventory 페이지가 더 이상
-- listInventoryMaterials 를 호출하지 않도록 동기화한 상태여야 한다.

drop function if exists public.adjust_inventory_material(uuid, text, integer, integer, integer, text);
drop function if exists public.set_inventory_material(uuid, text, integer, integer, integer, text);

drop table if exists public.guild_inventory_materials;
