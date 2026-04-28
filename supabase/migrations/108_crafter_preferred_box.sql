-- 108: 크래프터별 "내 박스 번호" 자동 채움 기능.
--
-- 길드 보관함 운영상 크래프터마다 자기 박스가 거의 정해져 있어 매 납품마다
-- 박스 번호를 입력하는 게 번거롭다. guild_avatars 에 크래프터별 선호 박스
-- 번호 + 자동 채움 토글을 추가해, DeliverDialog 가 박스 입력칸을 미리 채우게
-- 한다 (수동 변경은 여전히 가능).
--
-- 컬럼 두 개:
-- - craft_preferred_box_number: 자기 박스 번호 (NULL = 미지정)
-- - craft_box_auto_assign: 토글 ON 여부 (default false — 기존 사용자는 OFF)

alter table public.guild_avatars
  add column if not exists craft_preferred_box_number integer;

alter table public.guild_avatars
  add column if not exists craft_box_auto_assign boolean not null default false;

-- 박스 번호는 음수/0 일 수 없음. NULL 은 허용 (미지정 상태).
alter table public.guild_avatars
  drop constraint if exists guild_avatars_craft_preferred_box_chk;

alter table public.guild_avatars
  add constraint guild_avatars_craft_preferred_box_chk
    check (craft_preferred_box_number is null or craft_preferred_box_number >= 1);

comment on column public.guild_avatars.craft_preferred_box_number is
  '크래프터가 자기 길드 박스로 미리 지정한 번호. NULL 이면 미지정. DeliverDialog 가 craft_box_auto_assign=true 일 때 박스 입력칸을 이 값으로 미리 채운다.';

comment on column public.guild_avatars.craft_box_auto_assign is
  '박스 자동 배정 토글. true 일 때 DeliverDialog 의 박스 입력칸이 craft_preferred_box_number 로 미리 채워진다 (수동 변경 가능).';
