-- 공개 길드 프로필 (`/g/<slug>`) hero 아래에 렌더되는 갤러리 그리드.
-- 한 길드당 최대 N장 (앱에서 GALLERY_MAX_ITEMS = 6 으로 검사). 전용 테이블로
-- 분리한 이유: app_settings 의 단일 value 컬럼에 JSON 배열을 박으면 정렬/추가/
-- 삭제마다 전체 직렬화·파싱이 필요해, 이미지 한 장만 바꿔도 race 가 위험.
-- 행 단위 저장으로 두면 reorder 만 position 컬럼 일괄 update 로 처리 가능.

create table if not exists public.guild_profile_gallery_items (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  -- position 은 같은 guild_id 내 정렬용. 0..N-1 로 채우지만 reorder 시 일시적으로
  -- 같은 값이 잠깐 존재할 수 있어 unique 제약은 걸지 않는다.
  position integer not null default 0,
  -- public 버킷의 공개 URL 을 그대로 저장 (배너 컬럼과 동일 패턴).
  image_url text not null,
  -- 캡션은 옵션. 이미지 위에 작은 라벨로 노출될 수 있도록.
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists idx_guild_profile_gallery_guild
  on public.guild_profile_gallery_items (guild_id, position);

-- service-role only — 공개 라우트에서도 supabase-admin 으로 조회. RLS 정책 없음.
alter table public.guild_profile_gallery_items enable row level security;
