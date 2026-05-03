-- 마케팅 페이지(`/landing`, `/features`)의 스크린샷 슬롯을 슈퍼어드민이 직접
-- 업로드/관리. 슬롯당 여러 장 가능, position 으로 정렬, 캐러셀로 표시.
--
-- 슬롯 enum 은 `src/lib/marketing-screenshots.ts` 의 MarketingScreenshotKey 와
-- 1:1 일치. 새 슬롯 추가 시 두 곳 동시 변경 필요.

insert into storage.buckets (id, name, public)
values ('marketing-screenshots', 'marketing-screenshots', true)
on conflict (id) do nothing;

create table if not exists public.marketing_screenshots (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot in ('events','regear','craft','shop','stats')),
  -- position 은 같은 slot 내 정렬용. 0..N-1 로 채우지만 reorder 시 일시적으로
  -- 같은 값이 잠깐 존재할 수 있어 unique 제약은 걸지 않는다.
  position integer not null default 0,
  -- public 버킷의 공개 URL 을 그대로 저장.
  image_url text not null,
  alt_text text,
  uploaded_by_discord_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_screenshots_slot
  on public.marketing_screenshots (slot, position);

-- service-role only — 공개 라우트에서도 supabase-admin 으로 조회.
-- 슈퍼어드민 가드는 server action 단에서 처리, RLS 정책 미작성.
alter table public.marketing_screenshots enable row level security;
