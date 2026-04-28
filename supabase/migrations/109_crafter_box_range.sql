-- 109: 크래프터별 박스 단일 모델 → "박스 범위" 모델로 교체.
--
-- 이전 (108): 크래프터가 자기 박스 번호 1개를 등록 → 매 납품마다 자동 채움.
-- 이번 (109): 박스가 일회용 (요청자가 회수해야 비워짐) 이라 한 크래프터가
-- 한 번에 여러 박스를 점유한다. 따라서 단일 박스 모델은 부적합. 관리자가
-- 크래프터별로 [start, end] 범위를 할당하고, 자동 배정은 다음 규칙으로:
--   1) 이 task 의 요청자가 이미 점유 중인 박스가 있으면 → 같은 박스 재사용
--      (요청자는 한 번에 1개 박스만 사용. 회수 한 번에 끝낼 수 있게.)
--   2) 없으면 → 이 크래프터 범위 안에서 다른 요청자가 점유 안 한 가장
--      작은 박스 번호.
--   3) 범위 미지정 / 다 차면 → 자동 채움 X, 수동 입력.
--
-- 108 의 craft_preferred_box_number / craft_box_auto_assign 은 배포 직후
-- 사용자가 없어 안전하게 제거.

alter table public.guild_avatars
  drop column if exists craft_preferred_box_number;

alter table public.guild_avatars
  drop column if exists craft_box_auto_assign;

alter table public.guild_avatars
  drop constraint if exists guild_avatars_craft_preferred_box_chk;

alter table public.guild_avatars
  add column if not exists craft_box_range_start integer;

alter table public.guild_avatars
  add column if not exists craft_box_range_end integer;

-- 둘 다 NULL (미지정) 이거나 둘 다 NOT NULL 이어야 한다. 그리고 start ≤ end,
-- start ≥ 1.
alter table public.guild_avatars
  drop constraint if exists guild_avatars_craft_box_range_chk;

alter table public.guild_avatars
  add constraint guild_avatars_craft_box_range_chk
    check (
      (craft_box_range_start is null and craft_box_range_end is null)
      or (
        craft_box_range_start is not null
        and craft_box_range_end is not null
        and craft_box_range_start >= 1
        and craft_box_range_start <= craft_box_range_end
      )
    );

comment on column public.guild_avatars.craft_box_range_start is
  '관리자가 이 크래프터에게 할당한 길드 박스 범위의 시작 번호. NULL = 미지정. 자동 배정 시 이 범위 안에서만 박스를 고른다.';

comment on column public.guild_avatars.craft_box_range_end is
  '관리자가 이 크래프터에게 할당한 길드 박스 범위의 끝 번호. NULL = 미지정. start ≤ end 강제.';
