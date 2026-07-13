import { getSupabaseErrorCode, getSupabaseErrorMessage } from '@/lib/supabase-query-error'

export interface SupabaseReadResult<T> {
  data: T
  error: unknown
}

export interface SupabaseReadRetryContext {
  label: string
  attempt: number
  maxAttempts: number
  delayMs: number
  error: unknown
}

interface SupabaseReadRetryOptions {
  label: string
  maxAttempts?: number
  baseDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
  onRetry?: (context: SupabaseReadRetryContext) => void
}

const DEFAULT_MAX_ATTEMPTS = 2
const DEFAULT_BASE_DELAY_MS = 100
const TRANSIENT_STATUS_CODES = new Set(['408', '500', '502', '503', '504', '522', '524'])
const TRANSIENT_CODE_PATTERNS = [
  /^ECONN(?:RESET|REFUSED|ABORTED)$/i,
  /^ETIMEDOUT$/i,
  /^UND_ERR_(?:CONNECT_TIMEOUT|SOCKET)$/i,
]
const TRANSIENT_MESSAGE_PATTERN =
  /\b(?:502|503|504|522|524)\b|\b(?:connection timed out|network error|network request failed|fetch failed|connection reset|connection terminated|socket hang up)\b/i

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export function isTransientSupabaseReadError(error: unknown): boolean {
  const code = getSupabaseErrorCode(error)
  if (code && (TRANSIENT_STATUS_CODES.has(code) || TRANSIENT_CODE_PATTERNS.some((pattern) => pattern.test(code)))) {
    return true
  }
  return TRANSIENT_MESSAGE_PATTERN.test(getSupabaseErrorMessage(error))
}

// 읽기 쿼리 전용. 호출부가 callback으로 SELECT를 새로 생성하므로 첫 시도의
// query builder/transport 상태를 재사용하지 않는다. 쓰기 작업에는 사용 금지.
export async function retrySupabaseRead<T>(
  read: () => PromiseLike<SupabaseReadResult<T>>,
  options: SupabaseReadRetryOptions,
): Promise<SupabaseReadResult<T>> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS)
  const sleep = options.sleep ?? defaultSleep

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await read()
      if (!result.error || !isTransientSupabaseReadError(result.error) || attempt === maxAttempts) {
        return result
      }

      const delayMs = baseDelayMs * attempt
      options.onRetry?.({
        label: options.label,
        attempt,
        maxAttempts,
        delayMs,
        error: result.error,
      })
      await sleep(delayMs)
    } catch (error) {
      if (!isTransientSupabaseReadError(error) || attempt === maxAttempts) throw error

      const delayMs = baseDelayMs * attempt
      options.onRetry?.({
        label: options.label,
        attempt,
        maxAttempts,
        delayMs,
        error,
      })
      await sleep(delayMs)
    }
  }

  // maxAttempts는 최소 1로 정규화되어 이 분기에 도달할 수 없다.
  throw new Error('Supabase read retry exhausted without a result')
}
