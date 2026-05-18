// TEMP DISABLED (hotfix/sentry-disable): next.config.ts withSentryConfig 제거와
// 짝지어 instrumentation 도 no-op 처리. 미들웨어 번들에서 @sentry/nextjs 가
// 끌어오는 @swc/helpers 동적 require 가 Vercel NFT 추적 누락으로 500 유발.
// 원본 로직은 아래 주석. 복구 시 import + register + onRequestError 다시 활성화.
//
// import * as Sentry from '@sentry/nextjs'
//
// export async function register() {
//   if (process.env.NEXT_RUNTIME === 'nodejs') {
//     await import('./sentry.server.config')
//   }
//   if (process.env.NEXT_RUNTIME === 'edge') {
//     await import('./sentry.edge.config')
//   }
// }
//
// export const onRequestError = Sentry.captureRequestError

export async function register() {
  // no-op
}
