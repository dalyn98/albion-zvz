import { defineConfig } from 'vitest/config'

// Vitest 셋업. 도메인 invariant 화석화용 lib/ 순수 함수 단위 테스트가 1차 목표.
// 통합 테스트는 Phase 2/3 진입 시 Supabase 로컬(또는 클라우드 test) 셋업과 함께
// 별도 환경(`environment: 'happy-dom'` / DB 연결)으로 분리한다.
//
// `resolve.tsconfigPaths: true` 로 tsconfig.json 의 `@/*` 매핑을 native 해상도.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'dist'],
    testTimeout: 10_000,
  },
})
