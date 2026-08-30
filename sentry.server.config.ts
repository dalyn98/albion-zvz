// Sentry Node.js (RSC, route handlers, server actions, cron) 초기화.
// instrumentation.ts 의 register() 가 NEXT_RUNTIME==='nodejs' 일 때 import 한다.
//
// SENTRY_DSN 이 비어 있으면 SDK 가 no-op 으로 떨어지므로 dev/preview 에선
// 별도 분기 불필요. prod 에서만 DSN 을 Vercel env 에 채워 넣는다.

import * as Sentry from '@sentry/nextjs'
import { resolveSentryTraceSampleRate } from '@/lib/sentry-sampling'

Sentry.init({
  // 유지보수 종료 후 별도 Sentry 수집 비용이 발생하지 않도록 전송을 중단한다.
  // 운영 오류는 Vercel 기본 런타임 로그로만 남긴다.
  enabled: false,
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // 트랜잭션 샘플링: prod 에서 모든 RSC/route 호출을 트레이스로 보내면 비용 폭증.
  // 기본 5% 로 낮추고, 장애 분석 시 SENTRY_TRACES_SAMPLE_RATE 로 일시 상향한다.
  tracesSampleRate: resolveSentryTraceSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    process.env.VERCEL_ENV === 'production' ? 0.05 : 1.0,
  ),
  // 5xx/timeout 같은 경고는 console.warn 으로도 남기는데, Sentry 의 기본 console
  // 통합이 이걸 breadcrumb 로 자동 첨부 → exception 이 발생하면 직전 retry 흔적이
  // 같이 보인다.
  sendDefaultPii: false,
})
