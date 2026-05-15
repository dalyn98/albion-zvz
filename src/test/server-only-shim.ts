// Vitest shim — `server-only` 는 Next.js 빌드 타임 마커 패키지로 node_modules
// 최상위에 노출되지 않는다 (next/dist/compiled 안에 있음). vitest 가 lib/log.ts
// 같은 'server-only' import 를 해석할 수 있도록 빈 모듈로 alias.
export {}
