-- 124: 길드 단위 "추적 중인 장비 베이스" 테이블.
--
-- 배경: 마이그 110 이후 길드 재고는 itemId (인챈트 포함) 단위로 모든 장비
-- 카탈로그를 펼쳐서 보여줬다. 실사용 길드에서는 ~1100+ 종을 다 노출하면
-- 노이즈가 너무 커서 쓰이는 일부만 큐레이션할 수 있어야 한다는 요구.
--
-- 단위: "T{n}_" 접두사를 뗀 베이스 suffix. 예:
--   - 무기:   "2H_GALATINEPAIR"  → T4~T8 _2H_GALATINEPAIR 5장 카드 한꺼번에 노출
--   - 보조:   "OFF_TOWERSHIELD"
--   - 갑옷:   "HEAD_PLATE_SET1"
--   - 신발:   "SHOES_LEATHER_SET3"
-- 한 row 가 하나의 베이스 = 5 티어. 인챈트는 카드 안에서 그대로 노출.
--
-- RLS: 다른 모든 테이블과 동일하게 service_role 만 접근 (마이그 118 정책).
-- 정책을 두지 않으면 anon/authenticated 는 deny, 서버 액션은 admin client 로
-- BYPASSRLS 가 적용돼 그대로 작동한다.

create table if not exists public.guild_tracked_inventory_items (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  base_suffix text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (guild_id, base_suffix)
);

create index if not exists idx_tracked_inventory_guild
  on public.guild_tracked_inventory_items (guild_id);

alter table public.guild_tracked_inventory_items enable row level security;
