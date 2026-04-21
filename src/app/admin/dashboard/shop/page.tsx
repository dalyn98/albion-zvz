import { ShoppingBag } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { getAppSetting } from '@/lib/app-settings'
import ShopImportForm from '@/components/ShopImportForm'
import ShopBlacklistEditor from '@/components/ShopBlacklistEditor'
import ShopNameOverridesEditor from '@/components/ShopNameOverridesEditor'
import ShopSilverRateForm from '@/components/ShopSilverRateForm'
import NoticeSettingForm from '@/components/NoticeSettingForm'

export const dynamic = 'force-dynamic'

export default async function AdminShopPage() {
  const db = await requireAdmin()
  const [
    { data: blacklist },
    { data: overrides },
    deliveryNotice,
    silverToPointRate,
  ] = await Promise.all([
    db.from('shop_blacklist').select('item_name_raw').order('added_at', { ascending: false }),
    db
      .from('shop_name_overrides')
      .select('item_name_raw, unique_name')
      .order('added_at', { ascending: false }),
    getAppSetting('shop_delivery_notice', ''),
    getAppSetting('shop_silver_to_point_rate', '1'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShoppingBag size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">길드 상점 관리</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-4">
          <ShopImportForm />
        </div>
        <div className="space-y-4">
          <NoticeSettingForm
            settingKey="shop_delivery_notice"
            initialMessage={deliveryNotice}
            title="/shop 전달 공지"
            description="공개 상점 페이지 상단에 뜨는 배너입니다. 아이템 수령 방법, 영업 시간 등을 자유롭게 안내하세요."
            label="공지 내용"
            placeholder="예: 주문 승인 후 디스코드 #상점 채널에서 DM 받으면 인게임 우편으로 전달됩니다."
            clearLabel="배너 비우기"
            clearTooltip="빈 문자열 = 배너 숨김"
            tooLongTemplate={(max) => `최대 ${max}자까지 입력 가능`}
          />
          <ShopSilverRateForm initial={silverToPointRate} />
          <ShopBlacklistEditor
            initial={(blacklist ?? []).map((r) => r.item_name_raw as string)}
          />
          <ShopNameOverridesEditor
            initial={(overrides ?? []).map((r) => ({
              itemName: r.item_name_raw as string,
              uniqueName: r.unique_name as string,
            }))}
          />
        </div>
      </div>
    </div>
  )
}
