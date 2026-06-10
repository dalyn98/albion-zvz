// regear-admin 의 type 정의 + 공통 helper. 'use server' 가 아닌 순수 모듈 —
// 서버 컴포넌트와 다른 server-action 모듈에서 자유롭게 import. 이 파일의
// async 함수들은 server-action 으로 노출되지 않고 (호출자가 RSC 또는 다른
// server action) 내부 helper 로만 쓰인다.
//
// type / const / 비-action async helper 를 한 곳에 모았다.

import { getAppSetting } from '@/lib/app-settings'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import type { RegearRejectReasonCode } from '@/lib/regear-reject-reasons'
import type { CraftRegearSlot } from '@/lib/regear-craft-slots'
import type { BuildSnapshot, RegearType } from '@/types'
import type { AlbionIdentityRelation } from '@/lib/account-albion-identity'

export type RegearRequesterRelation = AlbionIdentityRelation

export type AdminRegearRequest = {
  id: string
  event_id: string
  // 마이그 097: 이벤트가 아닌 "리기어 윈도우" 기반 신청은 event_id 가 비고
  // regear_window_id 가 채워진다. 그룹/표시용 키로 사용한다.
  regear_window_id: string | null
  event_title: string
  discord_id: string
  username: string
  requester_relation: RegearRequesterRelation
  role_name: string
  silver: number
  request_type: RegearType
  claimed_silver: number | null
  // Actual credited amount for approved rows (rate × claimed, floor). NULL for
  // pending/rejected. Migration 044 adds and backfills the column.
  payout_silver: number | null
  // Optional normalized YouTube embed URL attached by the requester.
  video_proof_url: string | null
  // Effective approval-time payout rate for this row. Requests with video proof
  // use regear_video_payout_rate_percent; others use the base rate.
  payout_rate_percent: number
  // null once the retention window (48h after resolve) has expired.
  screenshot_path: string | null
  // 선택 사항 (migration 061). 데스당 2번째 스크린샷을 올린 경우에만 값이 있다.
  screenshot_path_2: string | null
  killboard_verified: boolean
  killboard_event_id: number | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  // 마이그 151. 거절 시 관리자가 드롭다운에서 선택한 enum 사유. status='rejected'
  // 인 row 만 값이 채워지고, pending/approved 는 항상 null. admin_notes (자유메모)
  // 와 함께 표시되어 멤버가 어떤 행동(재신청/추가증빙)을 해야 하는지 명확히 안내.
  reject_reason_code: RegearRejectReasonCode | null
  created_at: string
  resolved_at: string | null
  // 처리한 관리자 Discord ID + 당시 표시명 스냅샷. 마이그 040 이전 row 는 null.
  handled_by: string | null
  handled_by_username: string | null
  build_snapshot: BuildSnapshot | null
  // 제작 리기어 요청/승인 시점의 실제 지급 슬롯. 요청값은 멤버가 신청할 때,
  // 승인값은 관리자가 최종 큐잉/재고출고할 때 고정된다.
  craft_requested_slots: CraftRegearSlot[]
  craft_included_slots: CraftRegearSlot[] | null
  // 킬보드 장비 + AODP 시세로 추산한 시장가. 자동 리기어와 관리자 재확인에서
  // 동일 포맷(gear_breakdown.market_silver) 으로 기록한다. null = 추산 없음.
  estimated_silver: number | null
  // AODP 폴백 단계 (migration 065). null = 경고 없음. 자동 리기어는 모든 건이
  // status='pending' 으로 들어오고(migration 067), 이 필드는 UI 가 색상 배지로
  // 시세 정확도 경고를 띄우는 데 쓰인다. status 결정에는 영향 없음.
  price_warning_level: 'quality' | 'window' | 'bluezone' | 'redzone' | null
  // 자동 생성 여부. 자동 건은 gear_breakdown 에 부위별 시세 breakdown 을 저장해
  // 관리자/청구자가 내역을 확인·수정할 수 있다.
  auto_generated: boolean
  // 자동 건일 경우 부위별 breakdown. 수동 건이거나 breakdown 이 없으면 빈 배열.
  // 청구자의 수정 여부(user_edited) 도 함께 노출해 관리자가 AODP 추정과 구분
  // 가능하도록 한다.
  breakdown_items: Array<{
    slot: string
    unique_name: string
    enchant: number
    quality: number
    count: number
    price: number | null
    city: string | null
    fallback_tier: string | null
    user_edited: boolean
  }>
  // 어떻게 처리됐는지 — silver(실버 적립) / crafted(크래프트 큐) / stocked(재고 출고).
  // 'stocked' 는 마이그 111 이후에만 등장. UI 가 "재고로 지급" 버튼을 보일지 결정.
  fulfillment_mode: 'silver' | 'crafted' | 'stocked'
  // killboard_event_id 로 조인한 victim 행의 요약. 자동/추적사망 건은 스크린샷이
  // 없어 검토자가 어떤 사망인지 한눈에 파악하기 어렵다 — 상대/길드/Fame/IP 를
  // 카드에 같이 노출. null 이면 매핑 실패(legacy 등) 또는 victim row 미존재.
  kill_summary: {
    opponent_name: string | null
    opponent_guild: string | null
    fame: number
    item_power: number | null
    occurred_at: string
  } | null
}

export type AdminExchangeRequest = {
  id: string
  discord_id: string
  username: string
  silver: number
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  handled_by: string | null
  handled_by_username: string | null
  balance: number
}

export type RoleReward = {
  role_name: string
  silver: number
  updated_at: string
}

export type RegearOrigin = 'auto' | 'manual' | 'all'

export type RegearRelationFilter = 'home_guild' | 'alliance' | 'all'

export type RegearOriginCounts = {
  auto: number
  manual: number
  all: number
}

export type RegearRelationCounts = {
  home_guild: number
  alliance: number
  all: number
}

export type BulkRegearActionResult = {
  succeeded: number
  failed: number
  total: number
  errors: Array<{ id: string; error: string }>
  fatalError?: string
}

export type RecheckKillboardResult = {
  killboard_verified: boolean
  killboard_event_id: number | null
  admin_notes: string | null
  // Market-based estimate from the matched death equipment. Only set when
  // verification succeeded AND AODP returned at least one price. `null` means
  // either the request isn't verified or we couldn't price any slot.
  estimated_silver: number | null
  error?: string
}

export const DEFAULT_PAYOUT_RATE_PERCENT = 100
export const DEFAULT_VIDEO_PAYOUT_RATE_PERCENT = 100
export const SCREENSHOT_BUCKET = 'regear-screenshots'
// Signed URLs only need to live long enough for an admin to review. 10 min.
export const SCREENSHOT_URL_TTL_SECONDS = 10 * 60

// Read once and normalise. Centralised so admin action and UI loaders return
// the same number even if the DB row is malformed — 100% is the safe default
// since it matches the legacy "pay the full claim" behaviour.
function parsePayoutRate(raw: string, fallback: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return fallback
  }
  return parsed
}

export async function loadPayoutRatePercent(guildId: string): Promise<number> {
  const raw = await getAppSetting(
    'regear_payout_rate_percent',
    String(DEFAULT_PAYOUT_RATE_PERCENT),
    guildId,
  )
  return parsePayoutRate(raw, DEFAULT_PAYOUT_RATE_PERCENT)
}

export async function loadVideoPayoutRatePercent(guildId: string): Promise<number> {
  const raw = await getAppSetting(
    'regear_video_payout_rate_percent',
    String(DEFAULT_VIDEO_PAYOUT_RATE_PERCENT),
    guildId,
  )
  return parsePayoutRate(raw, DEFAULT_VIDEO_PAYOUT_RATE_PERCENT)
}

export async function getRegearPayoutRateConfig(): Promise<{
  baseRatePercent: number
  videoRatePercent: number
}> {
  const session = await getSession()
  if (!session) {
    return {
      baseRatePercent: DEFAULT_PAYOUT_RATE_PERCENT,
      videoRatePercent: DEFAULT_VIDEO_PAYOUT_RATE_PERCENT,
    }
  }
  const guildId = await getSessionGuildId(session)
  const [baseRatePercent, videoRatePercent] = await Promise.all([
    loadPayoutRatePercent(guildId),
    loadVideoPayoutRatePercent(guildId),
  ])
  return { baseRatePercent, videoRatePercent }
}

// Exposed so the review UI can show "청구 X → 지급 Y (Z%)" without calling
// the RPC path. 세션이 없으면 기본값으로 degrade — 호출부가 미로그인 경로로
// 들어온 경우 (예: /regear 는 redirect 로 세션 강제하지만 방어적으로) 안전값.
export async function getRegearPayoutRatePercent(): Promise<number> {
  const session = await getSession()
  if (!session) return DEFAULT_PAYOUT_RATE_PERCENT
  const guildId = await getSessionGuildId(session)
  return loadPayoutRatePercent(guildId)
}
