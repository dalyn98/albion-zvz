import { requireSuperAdmin } from '@/lib/super-admin'
import {
  loadMarketingScreenshots,
  MARKETING_SCREENSHOT_KEYS,
  type MarketingScreenshotKey,
} from '@/lib/marketing-screenshots'
import SuperAdminMarketingScreenshotPanel from '@/components/SuperAdminMarketingScreenshotPanel'

export const dynamic = 'force-dynamic'

const SLOT_LABELS: Record<MarketingScreenshotKey, string> = {
  events: '이벤트 (정모/소집)',
  regear: '리기어 (장비 청구)',
  craft: '제작 리기어',
  shop: '길드 상점',
  stats: '통계 / 리더보드',
}

export default async function MarketingScreenshotsPage() {
  await requireSuperAdmin()
  const grouped = await loadMarketingScreenshots()

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-white">마케팅 스크린샷</h1>
        <p className="text-sm text-gray-400">
          공개 랜딩 페이지(<code>/landing</code>, <code>/features</code>)에 노출되는
          스크린샷을 슬롯별로 관리합니다. 한 슬롯에 여러 장 올리면 사용자에게 캐러셀로
          표시되며, 좌우로 드래그/스와이프하여 볼 수 있습니다.
        </p>
        <p className="text-xs text-gray-500">
          권장 사양: 16:9 비율, 1920×1080. PNG / JPG / WEBP. 최대 8MB.
        </p>
      </header>

      <div className="space-y-4">
        {MARKETING_SCREENSHOT_KEYS.map((slot) => (
          <SuperAdminMarketingScreenshotPanel
            key={slot}
            slot={slot}
            label={SLOT_LABELS[slot]}
            images={grouped[slot]}
          />
        ))}
      </div>
    </div>
  )
}
