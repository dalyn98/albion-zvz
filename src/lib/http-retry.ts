// 외부 API (gameinfo / killboard / aodp / battles) 호출용 공통 fetch 헬퍼.
// 5분 cron 이 일시적 5xx/timeout 에 그대로 실패해 사용자 노출 (regear 청구
// 거절 / 자동 정모 알림 누락 / 자동 리기어 stage 1 누락) 되던 케이스를
// retry 로 감추기 위함. 4xx 는 곧바로 실패 (요청이 잘못됐다는 신호).
//
// 호출자는 label / userAgent 만 주면 되고, 캐시 정책 (cache, next.revalidate)
// 은 fetchInit 으로 그대로 통과한다. 시그니처는 의도적으로 작게 유지 — caller
// 별 특수 처리는 caller 내부에서 throw 한 HttpFetchError 의 status 로 분기.

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_BACKOFF_MS = 500

export class HttpFetchError extends Error {
  readonly label: string
  readonly status: number | null

  constructor(label: string, status: number | null, message?: string) {
    super(message ?? `${label} ${status ?? 'network error'}`)
    this.name = 'HttpFetchError'
    this.label = label
    this.status = status
  }
}

export interface FetchJsonOpts {
  // 호출 식별자 — 에러 메시지/로그에 prefix 로 들어간다.
  label: string
  // User-Agent 헤더. 호출별로 운영자가 구분 가능해야 하므로 caller 가 설정.
  userAgent: string
  // attempt 당 timeout. 기본 10s.
  timeoutMs?: number
  // 총 시도 횟수 (초기 시도 포함). 기본 3 → 500/1000ms 백오프 후 재시도.
  maxAttempts?: number
  // 지수 백오프의 base. 기본 500ms → 500/1000/2000... 에 ±25% jitter.
  baseBackoffMs?: number
  // fetch 의 cache/next 등 추가 init. signal/headers 는 본 헬퍼가 채운다.
  fetchInit?: Omit<RequestInit, 'signal' | 'headers'>
}

// 408 (Request Timeout), 425 (Too Early), 429 (Too Many Requests), 5xx 는
// transient 으로 간주하고 retry. 그 외 4xx 는 caller 가 잘못 보낸 것이라
// 즉시 throw — 재시도해도 결과가 같다.
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchJsonWithRetry<T>(
  url: string,
  opts: FetchJsonOpts,
): Promise<T> {
  const {
    label,
    userAgent,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
    fetchInit = {},
  } = opts

  let lastError: Error = new HttpFetchError(label, null, `${label}: no attempt made`)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let retryable = false

    try {
      const res = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
        headers: { 'User-Agent': userAgent },
      })
      if (res.ok) {
        return (await res.json()) as T
      }
      lastError = new HttpFetchError(label, res.status)
      retryable = isRetryableStatus(res.status)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // 네트워크 끊김 / AbortError (timeout) → retry.
      retryable = true
    } finally {
      clearTimeout(timer)
    }

    if (!retryable || attempt === maxAttempts) {
      throw lastError
    }

    if (attempt < maxAttempts) {
      console.warn(
        `[http-retry] ${label} attempt ${attempt}/${maxAttempts} failed (${lastError.message}); retrying`,
      )
    }

    // 75-125% jitter 가 붙은 지수 백오프 (500/1000/2000ms ±25%)
    const jitter = 0.75 + Math.random() * 0.5
    const delay = Math.round(baseBackoffMs * 2 ** (attempt - 1) * jitter)
    await sleep(delay)
  }

  throw lastError
}
