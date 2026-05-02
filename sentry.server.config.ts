// Sentry Node.js (RSC, route handlers, server actions, cron) 초기화.
// instrumentation.ts 의 register() 가 NEXT_RUNTIME==='nodejs' 일 때 import 한다.
//
// SENTRY_DSN 이 비어 있으면 SDK 가 no-op 으로 떨어지므로 dev/preview 에선
// 별도 분기 불필요. prod 에서만 DSN 을 Vercel env 에 채워 넣는다.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // 트랜잭션 샘플링: prod 에서 모든 RSC/route 호출을 트레이스로 보내면 비용 폭증.
  // 10% 만 샘플링해도 cron/regear 같은 핫패스의 p95/p99 분포는 충분히 잡힌다.
  tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 1.0,
  // 5xx/timeout 같은 경고는 console.warn 으로도 남기는데, Sentry 의 기본 console
  // 통합이 이걸 breadcrumb 로 자동 첨부 → exception 이 발생하면 직전 retry 흔적이
  // 같이 보인다.
  sendDefaultPii: false,
})
