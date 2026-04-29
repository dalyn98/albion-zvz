-- 118: 모든 public 스키마 테이블에 RLS 활성화.
--
-- 배경: Supabase 보안 알림 (2026-04-27) 에 따르면 public 스키마 테이블 일부가
-- RLS 비활성 상태라 anon JWT 만 있으면 누구나 read/edit/delete 가능했다.
-- 이 코드베이스는:
--   - 모든 서버 액션·RSC 가 SUPABASE_SERVICE_ROLE_KEY 로 만든 admin client 사용
--     (`src/lib/supabase-admin.ts`)
--   - `src/lib/supabase.ts` 의 anon client 는 import 되는 곳이 0건 (실코드 미사용)
--   - 인증은 custom HMAC-SHA256 signed cookie (NextAuth 미사용)
-- 따라서 RLS 를 켜고 정책 없이 두면:
--   - anon/authenticated 는 모든 테이블에서 deny (정책 없음 = deny all)
--   - service_role 은 BYPASSRLS 속성으로 무시 → 서버 코드 그대로 작동
--
-- 동적 do-block 으로 모든 테이블에 일괄 적용 — 누락된 테이블이 있어도 cover.

do $$
declare
  rec record;
begin
  for rec in
    select tablename
      from pg_tables
     where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', rec.tablename);
  end loop;
end $$;
