import 'server-only'
import * as Sentry from '@sentry/nextjs'

// API route / cron / server action 공용 구조화 로거.
//
// Sentry 가 server-side 에 이미 설치돼 있지만 (sentry.server.config.ts) 자동 capture
// 는 throw 된 예외만 잡는다. 우리 코드는 대부분 caught error → console.error + 빈
// 응답 패턴이라 prod 에서 Vercel 로그만 남고 Sentry 알림이 오지 않는 사각지대가
// 생긴다. 이 모듈은 console 출력 + Sentry capture 를 한 번에 처리.
//
// 사용:
//   log.error('[discord/bot-callback] guild upsert failed', err, { tenantId, discordId })
//   log.warn('[cron/event-imminent] dm send skipped', { reason: 'no_token' })
//   log.info('[shop/sync] complete', { synced: 42 })
//
// 컨텍스트(ctx) 는 Sentry 의 setContext + breadcrumb 로 변환돼 이슈 화면에서
// 필터링 가능. tenant_id / discord_id / route 를 일관되게 채우면 트리아지가 빨라진다.

type LogContext = Record<string, unknown>

function formatPrefix(message: string): string {
  return message
}

function dispatchConsole(level: 'info' | 'warn' | 'error', message: string, ctx?: LogContext): void {
  if (ctx && Object.keys(ctx).length > 0) {
    console[level](formatPrefix(message), ctx)
  } else {
    console[level](formatPrefix(message))
  }
}

function captureWithContext(
  err: unknown,
  message: string,
  ctx: LogContext | undefined,
  level: Sentry.SeverityLevel,
): void {
  // Sentry DSN 이 없으면 init 이 no-op 모드라 captureException 도 silent — dev/preview
  // 에서 별도 분기 불필요.
  Sentry.withScope((scope) => {
    scope.setLevel(level)
    if (ctx) scope.setContext('log', ctx as Record<string, unknown>)
    scope.setExtra('message', message)
    if (err instanceof Error) {
      Sentry.captureException(err)
    } else if (err !== undefined) {
      // 비 Error 값 (PostgrestError, 문자열, 객체) 도 throw 하지 않고 메시지로 보냄.
      Sentry.captureMessage(`${message}: ${safeStringify(err)}`, level)
    } else {
      Sentry.captureMessage(message, level)
    }
  })
}

function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export const log = {
  info(message: string, ctx?: LogContext): void {
    dispatchConsole('info', message, ctx)
  },
  warn(message: string, ctx?: LogContext): void {
    dispatchConsole('warn', message, ctx)
    captureWithContext(undefined, message, ctx, 'warning')
  },
  // err 자리에 catch 절의 unknown 을 그대로 넘기면 Error 인지 구분해서 처리.
  // 첫 인자가 메시지, 두 번째가 error, 세 번째가 컨텍스트. PostgrestError 같은
  // 비-Error 값도 ctx 의 cause 로 보존.
  error(message: string, err?: unknown, ctx?: LogContext): void {
    const finalCtx: LogContext = { ...(ctx ?? {}) }
    if (err !== undefined && !(err instanceof Error)) {
      finalCtx.cause = err
    }
    if (err instanceof Error) {
      dispatchConsole('error', message, { ...finalCtx, error: err.message })
    } else {
      dispatchConsole('error', message, finalCtx)
    }
    captureWithContext(err, message, finalCtx, 'error')
  },
}
