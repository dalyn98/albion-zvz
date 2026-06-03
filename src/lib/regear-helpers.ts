// 리기어 액션 모듈들 사이에서 공유되는 순수 헬퍼와 상수.
// - `src/app/actions/regear.ts` — 멤버 신청/조회
// - `src/app/actions/regear-edit.ts` — 멤버 본인 pending 행 편집
// 두 'use server' 파일은 같은 정규화/계산 로직을 써야 하므로 lib 으로 분리.

import {
  SLOT_KEYS,
  getDisplayGear,
  type BuildSnapshot,
  type SlotGearDisplay,
  type SlotKey,
} from '@/types'

export const SCREENSHOT_BUCKET = 'regear-screenshots'
// 10 MiB — 마이그 003 의 버킷 한도와 동일하게 유지.
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024
export const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
export const DAY_MS = 24 * 60 * 60 * 1000

// 자동 리기어 pending 상태에서 청구자가 부위별 시세를 수정할 때 쓰는 구조.
// auto-regear.ts 가 만든 gear_breakdown.items 와 동일한 필드 셋 + userEdited 플래그.
export interface RegearLineItem {
  slot: string
  uniqueName: string
  enchant: number
  quality: number
  count: number
  // 단위(1개) 실버 가격. null = AODP 에서 시세를 못 찾음 (청구자가 입력해야 지급 대상).
  price: number | null
  city: string | null
  fallbackTier: string | null
  // true 면 청구자가 직접 수정한 슬롯. 관리자 UI 에 배지로 노출해 AODP 자동
  // 추정과 구분할 수 있게 한다.
  userEdited: boolean
  // AODP 결과 신뢰도. 'low' 면 청구자에게 "직접 입력해 주세요" 안내 배지를
  // 띄운다. 옛 행은 confidence 가 없을 수 있어 nullable.
  confidence: 'high' | 'medium' | 'low' | 'none' | null
}

export interface RawBreakdownItem {
  slot?: unknown
  uniqueName?: unknown
  enchant?: unknown
  quality?: unknown
  count?: unknown
  price?: unknown
  city?: unknown
  fallbackTier?: unknown
  userEdited?: unknown
  confidence?: unknown
}

export interface RawBreakdown {
  role_cap?: unknown
  payout_rate_percent?: unknown
  market_silver?: unknown
  items?: unknown
  warning_level?: unknown
}

export function buildSnapshotFromSlot(
  slot: SlotGearDisplay,
  roleName: string,
): BuildSnapshot {
  const gear = SLOT_KEYS.reduce(
    (acc, k) => {
      const { name, id } = getDisplayGear(slot, k)
      acc[k] = { name: name ?? null, id: id ?? null }
      return acc
    },
    {} as Record<SlotKey, { name: string | null; id: string | null }>,
  )
  return { role_name: roleName || null, ...gear }
}

export function buildSnapshotFromRole(roleName: string): BuildSnapshot {
  const gear = SLOT_KEYS.reduce(
    (acc, k) => {
      acc[k] = { name: null, id: null }
      return acc
    },
    {} as Record<SlotKey, { name: string | null; id: string | null }>,
  )
  return { role_name: roleName || null, ...gear }
}

export function normalizeBreakdownItems(raw: unknown): RegearLineItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is RawBreakdownItem => typeof v === 'object' && v !== null)
    .map((v): RegearLineItem => {
      const confidence: 'high' | 'medium' | 'low' | 'none' | null =
        v.confidence === 'high' ||
        v.confidence === 'medium' ||
        v.confidence === 'low' ||
        v.confidence === 'none'
          ? v.confidence
          : null
      return {
        slot: typeof v.slot === 'string' ? v.slot : '',
        uniqueName: typeof v.uniqueName === 'string' ? v.uniqueName : '',
        enchant:
          typeof v.enchant === 'number' && Number.isFinite(v.enchant)
            ? Math.trunc(v.enchant)
            : 0,
        quality:
          typeof v.quality === 'number' && Number.isFinite(v.quality)
            ? Math.trunc(v.quality)
            : 1,
        count:
          typeof v.count === 'number' && Number.isFinite(v.count) && v.count > 0
            ? Math.trunc(v.count)
            : 1,
        price:
          typeof v.price === 'number' && Number.isFinite(v.price) && v.price >= 0
            ? Math.trunc(v.price)
            : null,
        city: typeof v.city === 'string' ? v.city : null,
        fallbackTier: typeof v.fallbackTier === 'string' ? v.fallbackTier : null,
        userEdited: v.userEdited === true,
        confidence,
      }
    })
    .filter((v) => v.slot.length > 0)
}

export function computeMarketSilverFromItems(items: RegearLineItem[]): number {
  let total = 0
  for (const it of items) {
    if (typeof it.price === 'number' && it.price > 0) {
      total += it.price * it.count
    }
  }
  return total
}

// 리기어 신청 오픈 시각 계산: 전투 시작 + windowMinutes 가 지나거나, 매칭된 전투
// 종료(ended_at 보유) 둘 중 빠른 쪽. 매칭이 0건이면 start + windowMinutes 폴백.
// requestRegearInner 와 listMyRegearEligibleEvents 가 같은 규칙을 공유한다.
export function computeRegearWindowOpenMs(
  battleStartMs: number,
  latestEndedMs: number,
  windowMinutes: number,
): number {
  const startPlusBufferMs = battleStartMs + windowMinutes * 60 * 1000
  return latestEndedMs > 0 ? Math.min(startPlusBufferMs, latestEndedMs) : startPlusBufferMs
}

export function computeRegearEligibilityDeadlineMs(
  anchorMs: number,
  eligibilityDays: number,
): number {
  return anchorMs + eligibilityDays * DAY_MS
}

export function isRegearEligibilityExpired(
  anchorMs: number,
  eligibilityDays: number,
  nowMs: number = Date.now(),
): boolean {
  return nowMs > computeRegearEligibilityDeadlineMs(anchorMs, eligibilityDays)
}

// matchedBattles 배열에서 가장 늦은 ended_at(ms) 을 뽑는다. 매칭 0건 또는 모두
// invalid 인 경우 0 반환 — 호출자는 0 을 "매칭 없음" 의 sentinel 로 사용.
export function latestEndedMsOf(matched: ReadonlyArray<{ endedAtIso: string }>): number {
  return matched.reduce((acc, b) => {
    const ms = Date.parse(b.endedAtIso)
    return Number.isFinite(ms) && ms > acc ? ms : acc
  }, 0)
}
