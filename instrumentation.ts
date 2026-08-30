// Vercel NFT 우회 — Turbopack 컴파일 산출물이 @swc/helpers 의 ESM 헬퍼를
// runtime-계산 절대경로로 require 하는데, NFT 가 정적 추적 못해 /var/task
// 누락 → MIDDLEWARE_INVOCATION_FAILED. instrumentation.ts 는 모든 함수 번들에
// 포함되므로 여기서 명시적 side-effect import 로 NFT 가 헬퍼 파일을 트레이스
// 하게 강제한다. 두 헬퍼는 runtime 에러에서 직접 호명된 것 + 가장 흔히 쓰임.
import '@swc/helpers/esm/_interop_require_default.js'
import '@swc/helpers/esm/_interop_require_wildcard.js'

export function register() {}
