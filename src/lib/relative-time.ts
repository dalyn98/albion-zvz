// 상대 시각 포맷터. server/client 양쪽에서 쓰기 위해 t 함수를 주입 받는다.
// time.* 네임스페이스 참조: justNow / minutesAgo / hoursAgo / today / daysAgo
// / monthsAgo / yearsAgo (모두 `{n}` 플레이스홀더 지원).

type TranslateFn = (key: string, values?: Record<string, number | string>) => string

// 분-단위 정밀도. 재고 최종 갱신처럼 짧은 간격을 보여줄 때 사용.
export function formatRelativeFine(iso: string | null, t: TranslateFn): string {
  if (!iso) return '—'
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return '—'
  const diffMin = Math.round((Date.now() - ts) / 60000)
  if (diffMin < 1) return t('justNow')
  if (diffMin < 60) return t('minutesAgo', { n: diffMin })
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return t('hoursAgo', { n: diffHr })
  const diffDay = Math.round(diffHr / 24)
  return t('daysAgo', { n: diffDay })
}

// 일-단위 정밀도. 이상 재고 패널처럼 오래된 데이터만 관심있을 때 사용.
export function formatRelativeCoarse(iso: string, t: TranslateFn): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const days = Math.floor((now - then) / (24 * 60 * 60 * 1000))
  if (days <= 0) return t('today')
  if (days < 30) return t('daysAgo', { n: days })
  const months = Math.floor(days / 30)
  if (months < 12) return t('monthsAgo', { n: months })
  const years = Math.floor(days / 365)
  return t('yearsAgo', { n: years })
}
