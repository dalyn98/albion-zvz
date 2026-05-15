// 통계 페이지 섹션들이 공유하는 타입 / 상수 / 헬퍼. 'use server' 가 아닌
// 순수 모듈 — 서버 컴포넌트 간 자유롭게 import. 페이지 page.tsx 가 1050 라인을
// 넘기며 섹션별 분리 (`./WithdrawnMembersSection` 외 4종) 가 필요해졌고,
// 그 과정에서 공통 타입을 한 곳으로 모았다.

import type { getTranslations } from 'next-intl/server'

export type StatsTranslator = Awaited<ReturnType<typeof getTranslations<'adminStats'>>>
export type CommonTranslator = Awaited<ReturnType<typeof getTranslations<'common'>>>

// 통계 페이지의 모든 상위 N 목록이 공유하는 기본 접힘 행수. 바꾸려면 여기만.
export const STATS_COLLAPSED_ROWS = 8

export function itemImageUrl(uniqueName: string, enchant: number, quality: number): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: '48' })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

// 포인트 원장의 reason 코드 → i18n 키. 원장 CHECK 제약이 migration 별로
// 달라 과거 데이터에 남아있는 레거시 reason 도 폴백 없이 그대로 표시해도
// 운영자가 해석 가능해야 하므로, 알려진 코드만 친화적으로 번역.
const REASON_KEY: Record<string, string> = {
  regear_approved: 'reasonRegearApproved',
  donation_approved: 'reasonDonationApproved',
  transfer_in: 'reasonTransferIn',
  admin_adjust: 'reasonAdminAdjust',
  exchange_paid: 'reasonExchangePaid',
  shop_purchase: 'reasonShopPurchase',
  transfer_out: 'reasonTransferOut',
}

export function reasonLabel(reason: string, tStats: StatsTranslator): string {
  const key = REASON_KEY[reason]
  return key ? tStats(key as Parameters<StatsTranslator>[0]) : reason
}
