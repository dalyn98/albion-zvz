// Sentry Edge runtime (middleware, edge route handlers) 초기화.
// 이 프로젝트는 middleware 한 곳에서만 edge runtime 을 쓰지만, Sentry SDK 는
// 각 runtime 별로 별도 init 이 필요해 분리.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 1.0,
})
