// Next.js 16 instrumentation hook. 서버 부팅 시 한 번 호출돼 Sentry 를 runtime
// 별로 초기화. onRequestError 는 RSC/route handler 에서 던져진 에러를 Sentry 로
// 전달하는 표준 훅 (Next.js 가 자동 호출).

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
