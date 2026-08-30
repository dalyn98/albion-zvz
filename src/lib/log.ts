import 'server-only'

// API route / cron / server action 공용 구조화 로거.
// 유지보수 모드에서는 외부 관측 서비스로 전송하지 않고 Vercel 기본 로그만 쓴다.
//
// 사용:
//   log.error('[discord/bot-callback] guild upsert failed', err, { tenantId, discordId })
//   log.warn('[cron/event-imminent] dm send skipped', { reason: 'no_token' })
//   log.info('[shop/sync] complete', { synced: 42 })
//
// tenant_id / discord_id / route 를 일관되게 채우면 런타임 로그 필터링이 쉽다.

type LogContext = Record<string, unknown>

function shouldEmitInfoLogs(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.AGM_VERBOSE_INFO_LOGS === 'true'
}

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

export const log = {
  info(message: string, ctx?: LogContext): void {
    // Normal success logs are the largest source of avoidable Vercel Observability
    // events. Keep them in dev/test, and make production info logs explicit opt-in.
    if (!shouldEmitInfoLogs()) return
    dispatchConsole('info', message, ctx)
  },
  warn(message: string, ctx?: LogContext): void {
    dispatchConsole('warn', message, ctx)
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
  },
}
