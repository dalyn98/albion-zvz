import 'server-only'
import type { NextRequest } from 'next/server'
import { log } from '@/lib/log'
import { detectInAppBrowser, detectMobilePlatform } from '@/lib/user-agent'

type AuthStartStage = 'discord_oauth' | 'bot_install' | 'open_bot_install'
type AuthSuccessStage = 'callback' | 'finish' | 'bot_callback'

function requestContext(request: NextRequest): Record<string, unknown> {
  const userAgent = request.headers.get('user-agent') ?? null
  return {
    host: request.headers.get('host') ?? null,
    referer: request.headers.get('referer') ?? null,
    user_agent: userAgent,
    in_app_browser: detectInAppBrowser(userAgent),
    mobile_platform: detectMobilePlatform(userAgent),
  }
}

export function recordAuthStart(
  request: NextRequest,
  stage: AuthStartStage,
  extra?: Record<string, unknown>,
): void {
  log.info(`[auth/${stage}] start`, {
    stage,
    ...requestContext(request),
    ...(extra ?? {}),
  })
}

export function recordAuthSuccess(
  request: NextRequest,
  stage: AuthSuccessStage,
  extra?: Record<string, unknown>,
): void {
  log.info(`[auth/${stage}] success`, {
    stage,
    ...requestContext(request),
    ...(extra ?? {}),
  })
}

// /api/auth/discord/callback 과 /api/auth/finish 의 errorRedirect 직전에 호출.
// Sentry 에 warning 으로 올라가 reason 별 분포 + UA + host 가 검색 가능해진다.
// 모바일 로그인 실패 원인 (인앱 브라우저 / state 만료 / hop 호스트 미스매치) 을
// 데이터로 분간하기 위함이다.
export function recordAuthFailure(
  request: NextRequest,
  stage: 'callback' | 'finish',
  reason: string,
  extra?: Record<string, unknown>,
): void {
  log.warn(`[auth/${stage}] failure: ${reason}`, {
    stage,
    reason,
    ...requestContext(request),
    ...(extra ?? {}),
  })
}
