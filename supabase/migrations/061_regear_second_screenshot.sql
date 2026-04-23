-- 리기어 신청에 두 번째 스크린샷을 받을 수 있도록 추가 슬롯.
-- 데스당 최대 2장(서로 다른 사진) 을 올릴 수 있게 해, 관리자가 사망 정황을
-- 다각도로 검증할 수 있다. 두 번째 장은 선택 사항 — 기존 single-shot 흐름도
-- 그대로 유지된다.

alter table regear_requests
  add column if not exists screenshot_path_2 text;
