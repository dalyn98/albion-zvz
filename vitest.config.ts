import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Vitest 셋업. 도메인 invariant 화석화용 lib/ 순수 함수 단위 테스트가 1차 목표.
// 통합 테스트는 Phase 2/3 진입 시 Supabase 로컬(또는 클라우드 test) 셋업과 함께
// 별도 환경(`environment: 'happy-dom'` / DB 연결)으로 분리한다.
//
// `resolve.tsconfigPaths: true` 로 tsconfig.json 의 `@/*` 매핑을 native 해상도.
//
// `server-only` 는 Next 빌드 타임 마커라 최상위 node_modules 에 노출되지 않는다.
// vitest 가 lib/log.ts 같은 'server-only' import 를 해석할 수 있도록 빈 모듈로 alias.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': fileURLToPath(new URL('./src/test/server-only-shim.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'dist', 'src/**/*.integration.test.ts'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: [
        'src/lib/**/*.{ts,tsx}',
        'src/app/actions/**/*.ts',
        'src/app/api/**/route.ts',
        'src/components/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.integration.test.ts',
        'src/**/*.d.ts',
        'src/test/**',
      ],
      thresholds: {
        statements: 29.5,
        branches: 25,
        functions: 28.5,
        lines: 30.5,
      },
    },
  },
})
