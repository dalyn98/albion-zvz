-- 슬롯 순서 변경(swap/permutation) 시 두 단계로 slot_number 를 업데이트
-- 하는데, 첫 단계에서 임시로 20 초과 값에 파킹했다가 최종 값으로 돌려놓는
-- 방식이 필요하다. 기존 CHECK 가 1..20 으로 막혀 있어서 임시값을 쓸 수 없다.
--
-- 애플리케이션 레벨에서 한 파티 당 최대 20 슬롯(MAX_SLOTS_PER_PARTY)은
-- 그대로 강제되므로 DB CHECK 는 임시 범위를 허용하도록만 넓힌다.

ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_slot_number_check;
ALTER TABLE slots ADD CONSTRAINT slots_slot_number_check CHECK (slot_number >= 1 AND slot_number <= 1040);
