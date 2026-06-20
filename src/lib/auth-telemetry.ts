import 'server-only'
import type { NextRequest } from 'next/server'
import { log } from '@/lib/log'
import { detectInAppBrowser, detectMobilePlatform } from '@/lib/user-agent'
import { redactUrlSearch } from '@/lib/redact-search-params'

type AuthStartStage = 'discord_oauth' | 'bot_install' | 'open_bot_install'
type AuthSuccessStage = 'callback' | 'finish' | 'bot_callback'

const SENSITIVE_TELEMETRY_KEYS = new Set([
  'access_token',
  'authorization',
  'client_secret',
  'code',
  'id_token',
  'invite',
  'password',
  'refresh_token',
  'secret',
  'state',
  'token',
])

function sanitizeTelemetryValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (SENSITIVE_TELEMETRY_KEYS.has(key.toLowerCase())) return '[redacted]'
  return redactUrlSearch(value)
}

function sanitizeTelemetryFields(fields?: Record<string, unknown>): Record<string, unknown> {
  if (!fields) return {}
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, sanitizeTelemetryValue(key, value)]),
  )
}

function requestContext(request: NextRequest): Record<string, unknown> {
  const userAgent = request.headers.get('user-agent') ?? null
  return {
    host: request.headers.get('host') ?? null,
    referer: sanitizeTelemetryValue('referer', request.headers.get('referer') ?? null),
    user_agent: userAgent,
    in_app_browser: detectInAppBrowser(userAgent),
    mobile_platform: detectMobilePlatform(userAgent),
  }
}

export function createAuthTimer(): () => number {
  const startedAt = Date.now()
  return () => Math.max(0, Date.now() - startedAt)
}

export function recordAuthStart(
  request: NextRequest,
  stage: AuthStartStage,
  extra?: Record<string, unknown>,
): void {
  log.info(`[auth/${stage}] start`, {
    stage,
    ...requestContext(request),
    ...sanitizeTelemetryFields(extra),
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
    ...sanitizeTelemetryFields(extra),
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
    ...sanitizeTelemetryFields(extra),
  })
}
