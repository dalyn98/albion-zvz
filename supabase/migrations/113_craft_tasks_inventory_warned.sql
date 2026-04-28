-- 경고 납품 (warning delivery) 플래그.
--
-- 제작자가 deliver 할 때 길드 장비 재고에서 -1 차감하는 흐름으로 바뀌면서,
-- 재고가 0 인 itemId 가 한 개라도 포함된 deliver 는 "재고 없이 시장에서 구매
-- 해서 직접 리기어해준 경우" (= 경고 납품) 로 마킹한다. RPC floor=0 덕분에
-- 차감 자체는 안전하게 0 에서 멈추지만, 운영 통계에서 "정상 출고 vs 경고 출고"
-- 를 구분하려면 task 단위 플래그가 필요.
--
-- 기본값 false. 기존 deliver 된 행은 모두 false 로 남는다 (소급 적용 X).

alter table public.craft_tasks
  add column if not exists inventory_warned boolean not null default false;

create index if not exists idx_craft_tasks_inventory_warned
  on public.craft_tasks (guild_id, inventory_warned)
  where inventory_warned = true;

comment on column public.craft_tasks.inventory_warned is
  'Deliver 시점에 build_snapshot 의 추적 슬롯 중 길드 재고가 0 이었던 itemId 가 한 개라도 있었음. 통계/리포트에서 정상 출고와 구분하려는 용도.';
