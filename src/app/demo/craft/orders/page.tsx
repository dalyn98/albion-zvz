'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ClipboardList, Sparkles } from 'lucide-react'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import DemoCTACard from '../../_components/DemoCTACard'
import DemoGuidedTour from '../../_components/DemoGuidedTour'
import { useDemoToast } from '../../_components/DemoFeedbackProvider'

// 실 /craft/orders 비주얼 클론을 클라이언트 컴포넌트로 전환. 발주 수주 / 수주 취소 /
// 납품 흐름이 실제로 움직이고, 수량 입력과 탭 전환까지 동작한다. 새로고침 시
// 초기 상태로 돌아간다.

type ClaimStatus = 'claimed' | 'delivered'
type DemoCraftOrderTextKey =
  | 'orderPostedToday1420'
  | 'orderPostedToday1108'
  | 'orderPostedYesterday2245'
  | 'orderPostedYesterday1900'
  | 'orderPostedTwoDaysAgo'
  | 'orderNoteHeavyMace'
  | 'orderNoteHolyAvalon'

interface OrderRow {
  orderId: string
  itemId: string
  itemLabel: string
  enchant: number
  quantity: number
  remaining: number
  unitPrice: string
  postedBy: string
  postedAtKey: DemoCraftOrderTextKey
  notesKey?: DemoCraftOrderTextKey
  myClaim?: { qty: number; status: ClaimStatus }
}

type Tab = 'available' | 'mine'

const INITIAL_ORDERS: ReadonlyArray<OrderRow> = [
  {
    orderId: 'o1',
    itemId: 'T8_2H_MACE_HEAVY',
    itemLabel: 'Heavy Mace',
    enchant: 3,
    quantity: 10,
    remaining: 7,
    unitPrice: '850,000',
    postedBy: DEMO_MEMBERS[0].ign,
    postedAtKey: 'orderPostedToday1420',
    notesKey: 'orderNoteHeavyMace',
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
    postedAtKey: 'orderPostedToday1108',
    notesKey: 'orderNoteHolyAvalon',
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
    postedAtKey: 'orderPostedYesterday2245',
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
    postedAtKey: 'orderPostedYesterday1900',
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
    postedAtKey: 'orderPostedTwoDaysAgo',
    myClaim: { qty: 6, status: 'claimed' },
  },
]

function itemUrl(itemId: string, enchant: number): string {
  const q = enchant > 0 ? `?quality=3&enchantment=${enchant}` : '?quality=3'
  return `https://render.albiononline.com/v1/item/${itemId}.png${q}`
}

const STATUS_BADGE: Record<ClaimStatus, { bg: string; text: string }> = {
  claimed: { bg: 'bg-amber-500/15', text: 'text-amber-300' },
  delivered: { bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
}
const CRAFT_ORDERS_TOUR_STEPS = [
  { id: 'craft-orders-tabs' },
  { id: 'craft-orders-list' },
  { id: 'craft-orders-actions' },
] as const

function calcPayout(quantity: number, unitPrice: string): string {
  const n = Number(unitPrice.replaceAll(',', ''))
  if (!Number.isFinite(n)) return unitPrice
  return (quantity * n).toLocaleString()
}

export default function DemoCraftOrdersPage() {
  const t = useTranslations('craftOrders')
  const tDemoMe = useTranslations('demo.me')
  const tDemoCraft = useTranslations('demo.craft')
  const tCta = useTranslations('demo.ctaCard')
  const { showToast } = useDemoToast()

  const [orders, setOrders] = useState<ReadonlyArray<OrderRow>>(INITIAL_ORDERS)
  const [tab, setTab] = useState<Tab>('available')
  const [claimDraft, setClaimDraft] = useState<Record<string, number>>({})

  const available = useMemo(() => orders.filter((o) => !o.myClaim), [orders])
  const mine = useMemo(() => orders.filter((o) => o.myClaim), [orders])
  const visible = tab === 'available' ? available : mine

  const setDraft = (orderId: string, value: number) => {
    setClaimDraft((prev) => ({ ...prev, [orderId]: value }))
  }

  const claimOrder = (order: OrderRow) => {
    const draftQty = claimDraft[order.orderId] ?? 1
    const qty = Math.max(1, Math.min(order.remaining, Math.floor(draftQty)))
    if (qty <= 0) return
    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === order.orderId
          ? {
              ...o,
              remaining: Math.max(0, o.remaining - qty),
              myClaim: { qty, status: 'claimed' as const },
            }
          : o,
      ),
    )
    setClaimDraft((prev) => {
      const next = { ...prev }
      delete next[order.orderId]
      return next
    })
    showToast(t('toastClaimed'))
  }

  const releaseClaim = (order: OrderRow) => {
    if (!order.myClaim) return
    const restored = order.myClaim.qty
    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === order.orderId
          ? {
              ...o,
              remaining: Math.min(o.quantity, o.remaining + restored),
              myClaim: undefined,
            }
          : o,
      ),
    )
    showToast(t('toastReleased'))
  }

  const deliverClaim = (order: OrderRow) => {
    if (!order.myClaim) return
    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === order.orderId && o.myClaim
          ? { ...o, myClaim: { ...o.myClaim, status: 'delivered' as const } }
          : o,
      ),
    )
    showToast(t('toastDelivered'))
  }

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <DemoGuidedTour steps={CRAFT_ORDERS_TOUR_STEPS} namespace="craftOrders" />
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
      <nav data-tour-id="craft-orders-tabs" role="tablist" aria-label={t('memberTabsLabel')} className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'available'}
          onClick={() => setTab('available')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
            tab === 'available'
              ? 'text-amber-300 border-amber-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <span>{t('memberTabAvailable')}</span>
          <span
            className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
              tab === 'available' ? 'bg-amber-500/30 text-amber-100' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {available.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mine'}
          onClick={() => setTab('mine')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
            tab === 'mine'
              ? 'text-amber-300 border-amber-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <span>{t('memberTabMine')}</span>
          <span
            className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
              tab === 'mine' ? 'bg-amber-500/30 text-amber-100' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {mine.length}
          </span>
        </button>
      </nav>

      <div data-tour-id="craft-orders-list" className="space-y-4">
        {visible.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-10 bg-gray-900 border border-gray-700 rounded-2xl">
            {tab === 'available' ? t('memberEmpty') : t('memberMineEmpty')}
          </p>
        ) : (
          visible.map((order) => {
            const claimedQty = order.quantity - order.remaining
            const fulfilled = order.remaining === 0
            const totalPayout = calcPayout(order.quantity, order.unitPrice)
            const draftQty = claimDraft[order.orderId] ?? 1
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
                      {t('postedByLabel', { name: order.postedBy })} ·{' '}
                      {t('postedAtLabel', { ts: tDemoCraft(order.postedAtKey) })}
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

                {order.notesKey && (
                  <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                      {t('orderNotesLabel')}
                    </p>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {tDemoCraft(order.notesKey)}
                    </p>
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
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_BADGE[order.myClaim.status].bg} ${STATUS_BADGE[order.myClaim.status].text}`}
                      >
                        {order.myClaim.status === 'claimed' ? t('statusClaimed') : t('statusDelivered')}
                      </span>
                    </div>
                  </div>
                )}

                {/* claim form / actions */}
                {!fulfilled && !order.myClaim && (
                  <div data-tour-id="craft-orders-actions" className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5">
                      <span className="sr-only">{t('claimQuantityLabel')}</span>
                      <input
                        type="number"
                        min={1}
                        max={order.remaining}
                        value={draftQty}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          if (Number.isFinite(v)) setDraft(order.orderId, v)
                        }}
                        className="bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono w-20"
                        aria-label={t('claimQuantityLabel')}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => claimOrder(order)}
                      className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-lg px-3 py-2"
                    >
                      {t('claimSubmit')}
                    </button>
                  </div>
                )}

                {order.myClaim?.status === 'claimed' && (
                  <div data-tour-id="craft-orders-actions" className="flex items-center gap-2 flex-wrap">
                    <div
                      className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-xs text-gray-500 italic"
                      aria-label={t('deliveryMemoLabel')}
                    >
                      {t('deliveryMemoPlaceholder')}
                    </div>
                    <button
                      type="button"
                      onClick={() => releaseClaim(order)}
                      className="text-xs text-gray-400 hover:text-rose-300 border border-gray-700 hover:border-rose-500/40 rounded-lg px-3 py-2"
                    >
                      {t('release')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deliverClaim(order)}
                      className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg px-3 py-2"
                    >
                      {t('deliverSubmit')}
                    </button>
                  </div>
                )}
              </article>
            )
          })
        )}
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
