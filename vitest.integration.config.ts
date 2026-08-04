import { defineConfig } from 'vitest/config'

// Supabase 통합 테스트 설정 (Phase 2). 단위 테스트(src/lib/*.test.ts) 와 분리.
//
// 실행: `npm run test:integration`
// 필요 env: TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_KEY
// 선택 env: TEST_SUPABASE_ANON_KEY (browser-role RLS integration tests)
//   → 둘 다 없으면 모든 describe 가 skip 되어 안전하게 통과 (CI 빨강 X).
//   → 하나만 있거나 prod URL/key 를 재사용하면 fail-fast.
//
// 로컬 셋업 (docker 필요):
//   1) `supabase start` — Postgres + GoTrue + PostgREST 컨테이너 기동
//   2) `supabase db reset` — 전체 누적 마이그 적용
//   3) `export TEST_SUPABASE_URL="http://127.0.0.1:54321"`
//      `export TEST_SUPABASE_SERVICE_KEY="<supabase status 출력의 service_role>"`
//   4) `npm run test:integration`
//
// remote Supabase test project 를 쓸 때만 ALLOW_REMOTE_TEST_SUPABASE=1 을 추가.
// 이 경우에도 TEST_SUPABASE_* 는 production NEXT_PUBLIC_SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY 와 같으면 즉시 실패한다.
//
// `*.integration.test.ts` 만 매칭 — 일반 unit test 와 분리. DB 연결 안정성을
// 위해 singleFork 로 직렬 실행 (parallel 충돌 / connection 폭주 방지).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.integration.test.ts'],
    exclude: ['node_modules', '.next', 'dist'],
    testTimeout: 30_000,
    // DB 연결 직렬화 — Vitest 4 의 fileParallelism off 가 동시 fork 폭주를
    // 막는다 (Vitest 3 의 poolOptions.forks.singleFork 와 동등).
    fileParallelism: false,
    // GitHub runner 의 local PostgREST 가 드물게 연결을 끊는 경우만 한 번
    // 재검증한다. 로컬 실행은 재시도 없이 유지해 실제 회귀를 바로 드러낸다.
    retry: process.env.CI ? 1 : 0,
  },
})
