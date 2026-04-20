-- 리기어 신청 시점의 빌드 스냅샷.
--
-- 관리자가 인게임에서 해당 유저가 신청한 빌드를 실제로 착용했는지
-- 확인하려면, 신청 시점의 gear 정보가 필요하다. 슬롯 자체는 이후
-- 편집/삭제될 수 있으므로 FK가 아니라 JSON 스냅샷으로 보존한다.
--
-- shape:
--   {
--     "role_name": "Healer",
--     "weapon":  {"name": "...", "id": "..."},
--     "head":    {...}, "armor":   {...},
--     "shoes":   {...}, "offhand": {...},
--     "potion":  {...}, "food":    {...},
--     "cape":    {...}
--   }
--
-- 각 gear 키는 getDisplayGear() 규칙 — assigned_* 있으면 그걸, 없으면
-- 고정 gear 사용. multi-option 슬롯은 member가 고른 pick이 저장됨.
--
-- 기존 행(NULL)은 레거시로 남음: 관리자 UI에서 "빌드 정보 없음"으로 표시.

ALTER TABLE regear_requests
  ADD COLUMN IF NOT EXISTS build_snapshot jsonb;
