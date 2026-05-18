import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { ClipboardList, Sparkles } from 'lucide-react'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import DemoActionButton from '../../_components/DemoActionButton'
import DemoCTACard from '../../_components/DemoCTACard'

// 실 /craft/orders 비주얼 클론 — 관리자 등록 발주를 길드원이 수주해 직접
// 제작·납품하고 단가 × 수량을 포인트로 받는다. CraftOrdersMemberClient 의 'available'
// 탭이 기본 노출. SSR 정적 마크업 + DemoActionButton 토스트.

type OrderRow = {
  orderId: string
  itemId: string
  itemLabel: string
  enchant: number
  quantity: number
  remaining: number
  unitPrice: string
  postedBy: string
  postedAt: string
  notes?: string
  myClaim?: { qty: number; status: 'claimed' | 'delivered' }
}

const ORDERS: ReadonlyArray<OrderRow> = [
  {
    orderId: 'o1',
    itemId: 'T8_2H_MACE_HEAVY',
    itemLabel: 'Heavy Mace',
    enchant: 3,
    quantity: 10,
    remaining: 7,
    unitPrice: '850,000',
    postedBy: DEMO_MEMBERS[0].ign,
    postedAt: '오늘 14:20',
    notes: '인챈트 +3 고정, 품질 무관. Bridgewatch 보관함 1~10번 사용 가능.',
  },
  {
    orderId: 'o2',
    itemId: 'T8_2H_HOLYSTAFF_AVALON',
    itemLabel: 'Holy Staff (Avalon)',
    enchant: 3,
    quantity: 5,
    remaining: 5,
    unitPrice: '1,200,000',
    postedBy: DEMO_MEMBERS[1].ign,
    postedAt: '오늘 11:08',
    notes: '아발론 무기 — Caerleon 만 제작 가능합니다.',
  },
  {
    orderId: 'o3',
    itemId: 'T7_2H_CROSSBOWLARGE',
    itemLabel: 'Heavy Crossbow',
    enchant: 2,
    quantity: 20,
    remaining: 14,
    unitPrice: '380,000',
    postedBy: DEMO_MEMBERS[0].ign,
    postedAt: '어제 22:45',
  },
  {
    orderId: 'o4',
    itemId: 'T8_ARMOR_PLATE_KEEPER',
    itemLabel: 'Guardian Armor',
    enchant: 3,
    quantity: 8,
    remaining: 8,
    unitPrice: '720,000',
    postedBy: DEMO_MEMBERS[0].ign,
    postedAt: '어제 19:00',
  },
  {
    orderId: 'o5',
    itemId: 'T7_2H_HOLYSTAFF',
    itemLabel: 'Holy Staff',
    enchant: 2,
    quantity: 6,
    remaining: 0,
    unitPrice: '320,000',
    postedBy: DEMO_MEMBERS[1].ign,
    postedAt: '2일 전',
    myClaim: { qty: 6, status: 'claimed' },
  },
]

function itemUrl(itemId: string, enchant: number): string {
  const q = enchant > 0 ? `?quality=3&enchantment=${enchant}` : '?quality=3'
  return `https://render.albiononline.com/v1/item/${itemId}.png${q}`
}

const STATUS_BADGE: Record<NonNullable<OrderRow['myClaim']>['status'], { bg: string; text: string }> = {
  claimed: { bg: 'bg-amber-500/15', text: 'text-amber-300' },
  delivered: { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
}

export default async function DemoCraftOrdersPage() {
  const [t, tDemoMe, tDemoCraft, tCta] = await Promise.all([
    getTranslations('craftOrders'),
    getTranslations('demo.me'),
    getTranslations('demo.craft'),
    getTranslations('demo.ctaCard'),
  ])

  const myCount = ORDERS.filter((o) => o.myClaim).length

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <ClipboardList size={20} className="text-amber-400" />
            {t('memberPageTitle')}
          </h1>
          <p className="text-gray-400 text-sm">{t('memberPageDescription')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemoCraft('ordersNotice')}</p>
      </div>

      {/* 탭 */}
      <nav role="tablist" aria-label={t('memberTabsLabel')} className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        <DemoActionButton className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px text-amber-300 border-amber-400 whitespace-nowrap">
          <span>{t('memberTabAvailable')}</span>
          <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-none flex items-center justify-center bg-amber-500/30 text-amber-100">
            {ORDERS.length}
          </span>
        </DemoActionButton>
        <DemoActionButton className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px text-gray-400 border-transparent hover:text-white whitespace-nowrap">
          <span>{t('memberTabMine')}</span>
          <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-none flex items-center justify-center bg-gray-800 text-gray-300">
            {myCount}
          </span>
        </DemoActionButton>
      </nav>

      <div className="space-y-4">
        {ORDERS.map((order) => {
          const claimedQty = order.quantity - order.remaining
          const fulfilled = order.remaining === 0
          const totalPayout = (order.quantity * Number(order.unitPrice.replaceAll(',', ''))).toLocaleString()
          return (
            <article
              key={order.orderId}
              className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3"
            >
              <header className="flex items-start gap-3">
                <Image
                  src={itemUrl(order.itemId, order.enchant)}
                  alt={order.itemLabel}
                  width={48}
                  height={48}
                  className="shrink-0 rounded"
                  unoptimized
                />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-white truncate">
                    {order.itemLabel}{' '}
                    {order.enchant > 0 && (
                      <span className="text-emerald-400 font-mono text-sm">+{order.enchant}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {t('postedByLabel', { name: order.postedBy })} · {t('postedAtLabel', { ts: order.postedAt })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
                  <span className="text-amber-300 font-bold font-mono text-base">
                    {order.unitPrice}
                  </span>
                  <span className="text-[10px] text-gray-500">{t('unitPriceLabel')}</span>
                </div>
              </header>

              {/* progress */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">{t('remainingLabel')}</p>
                  <p className="text-lg font-bold text-white font-mono">{order.remaining}</p>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">{t('claimedLabel')}</p>
                  <p className="text-lg font-bold text-amber-300 font-mono">{claimedQty}</p>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">{t('totalPayoutLabel')}</p>
                  <p className="text-sm font-bold text-emerald-300 font-mono">{totalPayout}</p>
                </div>
              </div>

              {order.notes && (
                <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">메모</p>
                  <p className="text-xs text-gray-300 leading-relaxed">{order.notes}</p>
                </div>
              )}

              {order.myClaim && (
                <div className="bg-gray-950 border border-amber-500/30 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">{t('myClaimsHeader')}</p>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-white">
                      {t('claimQuantityLabel')}{' '}
                      <span className="font-mono font-bold">{order.myClaim.qty}</span>
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_BADGE[order.myClaim.status].bg} ${STATUS_BADGE[order.myClaim.status].text}`}>
                      {order.myClaim.status === 'claimed' ? t('statusClaimed') : t('statusDelivered')}
                    </span>
                  </div>
                </div>
              )}

              {/* claim form / actions */}
              {!fulfilled && !order.myClaim && (
                <div className="flex items-center gap-2 flex-wrap">
                  <DemoActionButton
                    asDiv
                    className="bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono w-20 cursor-text"
                    ariaLabel={t('claimQuantityLabel')}
                  >
                    1
                  </DemoActionButton>
                  <DemoActionButton className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-lg px-3 py-2">
                    {t('claimSubmit')}
                  </DemoActionButton>
                </div>
              )}

              {order.myClaim?.status === 'claimed' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <DemoActionButton
                    asDiv
                    className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-xs text-gray-400 italic cursor-text"
                    ariaLabel={t('deliveryMemoLabel')}
                  >
                    {t('deliveryMemoPlaceholder')}
                  </DemoActionButton>
                  <DemoActionButton className="text-xs text-gray-400 hover:text-rose-300 border border-gray-700 hover:border-rose-500/40 rounded-lg px-3 py-2">
                    {t('release')}
                  </DemoActionButton>
                  <DemoActionButton className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg px-3 py-2">
                    {t('deliverSubmit')}
                  </DemoActionButton>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tDemoCraft('ctaMemberTitle')}
        description={tDemoCraft('ctaMemberDescription')}
        buttonLabel={tCta('buttonLabel')}
      />
    </main>
  )
}
