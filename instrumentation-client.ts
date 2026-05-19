// Next.js 16 client instrumentation. React hydration 직전에 한 번 실행되며
// Sentry 의 브라우저 SDK 를 초기화한다. onRouterTransitionStart 는 App Router
// 의 클라이언트 네비게이션을 트랜잭션으로 감싸 성능 트레이스에 포함시킨다.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // 클라이언트는 페이지뷰 단위로 트랜잭션을 만든다. 10% 면 일반 사용자 trace
  // 양과 비용 균형이 맞고, 에러는 별개로 100% 캡처된다.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Replay 는 일단 끄고 — 비용 + GDPR 고려. 필요하면 나중에 켜자.
  // 첫 페이지뷰 직후 페이지 이동이 빠른 모바일에서 client_report beacon 이
  // pagehide 와 경쟁해 ERR_ABORTED 로 잡힌다. 우리는 client_report (rate-limited
  // event 카운터) 자체가 운영상 필요하지 않으니 끈다. 에러/트레이스는 영향 없음.
  sendClientReports: false,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
