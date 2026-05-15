// 데모 통계 페이지 섹션이 공유하는 타입 / 상수 / 헬퍼.
// 실제 통계 페이지(admin/dashboard/stats) 와 구조가 같지만 fetch 가 아닌
// `@/data/demo-seed` 의 정적 데이터를 쓴다는 점이 다르다.

import type { getTranslations } from 'next-intl/server'

export type StatsTranslator = Awaited<ReturnType<typeof getTranslations<'adminStats'>>>
export type CommonTranslator = Awaited<ReturnType<typeof getTranslations<'common'>>>

export const STATS_COLLAPSED_ROWS = 8

export function itemImageUrl(uniqueName: string, enchant: number, quality: number): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: '48' })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

// 데모 페이지에선 실제 멤버 아바타가 없어서 회색 원으로 대체.
export function MockAvatar({ size = 24 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-gray-700 flex-shrink-0"
      style={{ width: size, height: size }}
    />
  )
}

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
