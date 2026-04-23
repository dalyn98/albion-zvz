'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ShoppingCart,
  X,
  Plus,
  Minus,
  Search,
  Send,
  Loader2,
  Trash2,
  Info,
} from 'lucide-react'
import { submitShopOrder } from '@/app/actions/shop-member'
import { AODP_INFO_TOOLTIP } from '@/lib/shop/aodp-constants'

export type ShopPriceWarning = 'quality' | 'window' | 'bluezone' | 'redzone' | null

export interface CatalogItem {
  id: string
  uniqueName: string
  enchant: number
  quality: number
  stock: number
  nameKo: string
  category: string | null
  tier: number | null
  pointPrice: number
  priceWarning: ShopPriceWarning
}

// AODP 폴백 단계별 경고 메타. 공통 라벨은 "시세 부정확" — 구매자 입장에선 왜
// 정확하지 않은지보다 "믿을 수 없음" 이 먼저 읽혀야 한다. 색상으로 심각도만
// 차등 (노랑=경미, 주황=주의, 빨강=심각) 하고 구체 원인은 툴팁으로 보조.
const PRICE_WARNING_LABEL = '시세 부정확'

const PRICE_WARNING_META: Record<
  NonNullable<ShopPriceWarning>,
  { color: string; tooltip: string }
> = {
  quality: {
    color: 'bg-yellow-400 text-black',
    tooltip:
      '시세 부정확: 이 아이템 품질의 시세 데이터가 없어 낮은 품질로 대체 추정된 가격입니다.',
  },
  window: {
    color: 'bg-yellow-400 text-black',
    tooltip:
      '시세 부정확: 최근 시세가 부족해 최대 14일 평균으로 추정된 가격입니다.',
  },
  bluezone: {
    color: 'bg-orange-500 text-black',
    tooltip:
      '시세 부정확: 현재 도시 시세가 없어 다른 로열 시티 시세로 추정된 가격입니다. 실제 거래 시 순간이동 비용·시간이 들 수 있습니다.',
  },
  redzone: {
    color: 'bg-red-600 text-white',
    tooltip:
      '시세 부정확: 로열 시티 시세가 모두 없어 레드존(칼레온·브레실리앙) 시세로 추정된 가격입니다. PvP 위험 지역이라 실제 가치와 차이가 클 수 있습니다.',
  },
}

interface Props {
  items: CatalogItem[]
  balance: number
  isMember: boolean
  // AODP 기준 도시 한글 라벨 — /shop 상단에 "시세 기준: ○○" 로 노출한다.
  baseCityLabel: string
}

interface CartLine {
  item: CatalogItem
  qty: number
}

const QUALITY_RING: Record<number, string> = {
  1: 'ring-gray-500/60',
  2: 'ring-sky-300/70',
  3: 'ring-blue-400/80',
  4: 'ring-purple-400/80',
  5: 'ring-amber-300/90',
}

const QUALITY_LABELS = ['?', '일반', '좋음', '뛰어남', '우수', '걸작']

function imageUrl(uniqueName: string, enchant: number, quality: number, size = 96): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: String(size) })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

export default function ShopCatalog({
  items,
  balance,
  isMember,
  baseCityLabel,
}: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<number | 'all'>('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (tier !== 'all' && it.tier !== tier) return false
      if (!q) return true
      return (
        it.nameKo.toLowerCase().includes(q) ||
        it.uniqueName.toLowerCase().includes(q)
      )
    })
  }, [items, query, tier])

  const totalQty = cart.reduce((s, l) => s + l.qty, 0)
  const totalPoints = cart.reduce((s, l) => s + l.qty * l.item.pointPrice, 0)
  const insufficient = totalPoints > balance

  const addToCart = (item: CatalogItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id)
      if (!existing) return [...prev, { item, qty: 1 }]
      // 재고만큼 담긴 상태에서 또 클릭하면 "초과"로 보고 장바구니에서 완전히 뺀다.
      // 0 → 1 → … → stock → 0 사이클 — 잘못 담았을 때 빠르게 리셋하는 용도.
      if (existing.qty >= item.stock) {
        return prev.filter((l) => l.item.id !== item.id)
      }
      return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l))
    })
    setResult(null)
  }

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => {
      const line = prev.find((l) => l.item.id === id)
      if (!line) return prev
      const next = Math.max(0, Math.min(line.item.stock, line.qty + delta))
      if (next === 0) return prev.filter((l) => l.item.id !== id)
      return prev.map((l) => (l.item.id === id ? { ...l, qty: next } : l))
    })
  }

  const removeLine = (id: string) => {
    setCart((prev) => prev.filter((l) => l.item.id !== id))
  }

  const clearCart = () => {
    setCart([])
    setNote('')
    setResult(null)
  }

  const handleSubmit = () => {
    if (cart.length === 0) return
    setResult(null)
    startTransition(async () => {
      const res = await submitShopOrder(
        cart.map((l) => ({ inventoryId: l.item.id, quantity: l.qty })),
        note,
      )
      if (res.ok) {
        setCart([])
        setNote('')
        setCartOpen(false)
        setResult({ ok: true, message: '주문 요청 완료! 관리자 승인을 기다려주세요.' })
        router.refresh()
      } else {
        setResult({ ok: false, message: res.error ?? '주문 실패' })
      }
    })
  }

  // 좌: 카탈로그, 우: 장바구니 (lg+ 상시 표시). 모바일에선 아래 토글 드로어로 전환.
  return (
    <div className="lg:grid lg:grid-cols-[1fr_20rem] lg:gap-4 lg:items-start">
      <div className="space-y-3 min-w-0">
        {/* 시세 기준 도시 안내 — 관리자가 설정한 홈 거래소. Info 아이콘 호버 시
            AODP 폴백/부정확 사유를 설명하는 툴팁이 뜬다. 상점 전역에 적용되는
            힌트라 검색 툴바 위쪽 한 줄에 배치. */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span>시세 기준</span>
          <span className="text-amber-300 font-semibold">{baseCityLabel}</span>
          <span
            className="inline-flex cursor-help text-gray-500"
            aria-label="AODP 설명"
            title={AODP_INFO_TOOLTIP}
          >
            <Info size={12} />
          </span>
        </div>
        {/* 상단 도구: 검색 + 티어 필터 + 잔액 + (모바일) 장바구니 버튼 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="아이템 검색"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">전체 Tier</option>
            {[3, 4, 5, 6, 7, 8].map((t) => (
              <option key={t} value={t}>
                T{t}
              </option>
            ))}
          </select>
          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
            <span className="text-gray-500">잔액</span>
            <span className="font-mono font-bold text-amber-300">{balance.toLocaleString()}p</span>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            disabled={totalQty === 0}
            className="lg:hidden relative flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <ShoppingCart size={14} />
            장바구니
            {totalQty > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {totalQty}
              </span>
            )}
          </button>
        </div>

        {result && (
          <div
            className={`border rounded-lg px-3 py-2 text-xs ${
              result.ok
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-red-500/10 border-red-500/40 text-red-300'
            }`}
          >
            {result.message}
          </div>
        )}

        {/* 인게임 상자처럼 파치먼트 배경 위에 아이템 슬롯 그리드 */}
        <div
          className="rounded-xl p-3 sm:p-4"
          style={{
            background:
              'linear-gradient(145deg, #3a2d1f 0%, #2a1f15 40%, #1f170f 100%)',
            border: '1px solid #6b5033',
            boxShadow:
              'inset 0 0 30px rgba(0,0,0,0.4), inset 0 0 2px rgba(255,218,150,0.2)',
          }}
        >
          {filtered.length === 0 ? (
            <p className="text-amber-100/50 text-sm text-center py-10">
              {items.length === 0 ? '상점 재고가 비었습니다.' : '검색 결과 없음.'}
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2">
              {filtered.map((item) => (
                <ShopTile
                  key={item.id}
                  item={item}
                  cartQty={cart.find((l) => l.item.id === item.id)?.qty ?? 0}
                  onAdd={() => addToCart(item)}
                  disabled={!isMember}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 데스크톱 사이드바 — 상시 표시. 긴 카탈로그에도 sticky 로 따라옴. */}
      <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start">
        <CartPanel
          cart={cart}
          totalPoints={totalPoints}
          balance={balance}
          insufficient={insufficient}
          note={note}
          onNoteChange={setNote}
          onInc={(id) => updateQty(id, 1)}
          onDec={(id) => updateQty(id, -1)}
          onRemove={removeLine}
          onClear={clearCart}
          onSubmit={handleSubmit}
          pending={pending}
          isMember={isMember}
        />
      </aside>

      {/* 모바일 드로어 */}
      {cartOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/70 z-40 lg:hidden"
            onClick={() => setCartOpen(false)}
          />
          <aside className="lg:hidden fixed top-0 right-0 h-dvh w-full max-w-md bg-gray-950 border-l border-gray-800 z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg flex items-center gap-2">
                <ShoppingCart size={18} className="text-amber-400" />
                장바구니
              </h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="text-gray-400 hover:text-white p-1.5"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <CartPanel
                cart={cart}
                totalPoints={totalPoints}
                balance={balance}
                insufficient={insufficient}
                note={note}
                onNoteChange={setNote}
                onInc={(id) => updateQty(id, 1)}
                onDec={(id) => updateQty(id, -1)}
                onRemove={removeLine}
                onClear={clearCart}
                onSubmit={handleSubmit}
                pending={pending}
                isMember={isMember}
                variant="drawer"
              />
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

function ShopTile({
  item,
  cartQty,
  onAdd,
  disabled,
}: {
  item: CatalogItem
  cartQty: number
  onAdd: () => void
  disabled: boolean
}) {
  const quality = QUALITY_LABELS[item.quality] ?? '일반'
  const qualityRing = QUALITY_RING[item.quality] ?? QUALITY_RING[1]
  const inCart = cartQty > 0
  // 장바구니에 담긴 타일은 quality ring 을 덮어쓰고 에메랄드로 강하게 표시 —
  // "선택됨" 상태가 한눈에 들어오도록 외곽 링과 이너 글로우를 함께 바꾼다.
  const ringClass = inCart ? 'ring-2 ring-emerald-400' : `ring-1 ${qualityRing}`
  const atMax = cartQty >= item.stock

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      title={`${item.nameKo}${item.enchant > 0 ? ` .${item.enchant}` : ''} / ${quality} / ${item.pointPrice.toLocaleString()}p / 재고 ${item.stock.toLocaleString()}${inCart ? ` / 담긴 수량 ${cartQty}` : ''}${atMax ? ' / 클릭 시 비우기' : ''}`}
      className={`group relative flex flex-col rounded-md bg-[#1a140c] ${ringClass} hover:ring-2 ${
        inCart ? 'hover:ring-emerald-300' : 'hover:ring-amber-300'
      } transition-all overflow-hidden ${
        disabled ? 'opacity-70 cursor-not-allowed' : ''
      }`}
      style={{
        boxShadow: inCart
          ? 'inset 0 0 0 1px rgba(16,185,129,0.35), 0 0 0 2px rgba(16,185,129,0.15), 0 1px 2px rgba(0,0,0,0.5)'
          : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.5)',
      }}
    >
      {/* 아이콘 영역 (정사각형) */}
      <div className="relative aspect-square">
        <Image
          src={imageUrl(item.uniqueName, item.enchant, item.quality, 96)}
          alt={item.nameKo}
          fill
          className="object-contain p-1 pixel-img"
          sizes="100px"
          unoptimized
        />

        {/* 인챈트 (왼쪽 위) */}
        {item.enchant > 0 && (
          <span className="absolute top-0.5 left-1 text-[10px] font-bold text-cyan-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
            .{item.enchant}
          </span>
        )}

        {/* 재고 (오른쪽 위) — 작은 배지 */}
        <span className="absolute top-0.5 right-1 text-[10px] font-bold text-white/90 bg-black/60 rounded px-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          ×{item.stock.toLocaleString()}
        </span>

        {/* 선택된 수량 오버레이 — 중앙 하단에 크게. 작은 코너 배지 대신 한눈에
            "이만큼 담김" 을 읽게 한다. */}
        {inCart && (
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pointer-events-none">
            <span className="bg-emerald-500 text-white text-[12px] sm:text-sm font-bold font-mono rounded-md px-2 py-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.7)] ring-1 ring-emerald-300/60 mb-1">
              ×{cartQty}
            </span>
          </div>
        )}

      </div>

      {/* 시세 경고 라벨 — 가격 바 위에 풀 폭으로. 심각도에 따라 색상 차등.
          구매자가 "이 가격은 추정치 / 실거래가 다를 수 있음" 을 놓치지 않게
          가격 바 바로 위에 별도 줄로 배치. 가장 눈에 띄는 위치. */}
      {item.priceWarning && (
        <div
          title={PRICE_WARNING_META[item.priceWarning].tooltip}
          className={`text-[10px] sm:text-[11px] font-bold text-center leading-tight py-0.5 ${PRICE_WARNING_META[item.priceWarning].color}`}
        >
          ⚠ {PRICE_WARNING_LABEL}
        </div>
      )}

      {/* 가격 바 (하단 전체 폭) */}
      <div
        className={`px-1.5 py-1 text-center border-t ${
          inCart ? 'border-emerald-400/40' : 'border-amber-400/30'
        }`}
        style={{
          background: inCart
            ? 'linear-gradient(to bottom, rgba(16,185,129,0.18) 0%, rgba(6,95,70,0.28) 100%)'
            : 'linear-gradient(to bottom, rgba(245,158,11,0.18) 0%, rgba(180,83,9,0.28) 100%)',
        }}
      >
        <p
          className={`text-[13px] sm:text-sm font-bold font-mono leading-tight tracking-tight ${
            inCart ? 'text-emerald-100' : 'text-amber-200'
          }`}
        >
          {item.pointPrice.toLocaleString()}
          <span
            className={`text-[10px] ml-0.5 ${
              inCart ? 'text-emerald-300/80' : 'text-amber-300/70'
            }`}
          >
            P
          </span>
        </p>
      </div>
    </button>
  )
}

function CartPanel({
  cart,
  totalPoints,
  balance,
  insufficient,
  note,
  onNoteChange,
  onInc,
  onDec,
  onRemove,
  onClear,
  onSubmit,
  pending,
  isMember,
  variant = 'sidebar',
}: {
  cart: CartLine[]
  totalPoints: number
  balance: number
  insufficient: boolean
  note: string
  onNoteChange: (next: string) => void
  onInc: (id: string) => void
  onDec: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onSubmit: () => void
  pending: boolean
  isMember: boolean
  variant?: 'sidebar' | 'drawer'
}) {
  const totalQty = cart.reduce((s, l) => s + l.qty, 0)
  const isSidebar = variant === 'sidebar'

  return (
    <div
      className={
        isSidebar
          ? 'bg-gray-900 border border-gray-700 rounded-xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden'
          : 'flex flex-col h-full'
      }
    >
      {isSidebar && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="font-bold text-white text-sm flex items-center gap-2">
            <ShoppingCart size={16} className="text-amber-400" />
            장바구니
            {totalQty > 0 && (
              <span className="text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5">
                {totalQty}
              </span>
            )}
          </h2>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
        {cart.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-10">
            타일을 클릭해 담아보세요.
          </p>
        ) : (
          cart.map((line) => (
            <CartLineRow
              key={line.item.id}
              line={line}
              onInc={() => onInc(line.item.id)}
              onDec={() => onDec(line.item.id)}
              onRemove={() => onRemove(line.item.id)}
            />
          ))
        )}
      </div>

      <div className="border-t border-gray-800 px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">총액</span>
          <span className="font-mono font-bold text-amber-300">
            {totalPoints.toLocaleString()}p
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">잔액</span>
          <span className={`font-mono ${insufficient ? 'text-red-400' : 'text-gray-300'}`}>
            {balance.toLocaleString()}p
            {insufficient && <span className="ml-1 text-red-400">(부족)</span>}
          </span>
        </div>

        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
          placeholder="관리자에게 전달할 메모 (선택)"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={pending || cart.length === 0}
            className="text-[11px] text-gray-400 hover:text-red-300 disabled:text-gray-700 px-2"
          >
            비우기
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || cart.length === 0 || insufficient || !isMember}
            className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-3.5 py-1.5 rounded-lg text-xs"
          >
            {pending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Send size={12} />
            )}
            주문 요청
          </button>
        </div>

        {!isMember && (
          <p className="text-[11px] text-amber-300/80">
            길드원으로 인증된 계정만 주문할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  )
}

function CartLineRow({
  line,
  onInc,
  onDec,
  onRemove,
}: {
  line: CartLine
  onInc: () => void
  onDec: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-800 rounded-lg px-2 py-1.5">
      <div className="relative w-9 h-9 rounded bg-gray-950 flex-shrink-0">
        <Image
          src={imageUrl(line.item.uniqueName, line.item.enchant, line.item.quality, 48)}
          alt={line.item.nameKo}
          fill
          className="object-contain pixel-img"
          unoptimized
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-white truncate font-medium">
          {line.item.nameKo}
          {line.item.enchant > 0 && (
            <span className="text-cyan-300 ml-1 font-mono">.{line.item.enchant}</span>
          )}
        </p>
        <p className="text-[10px] text-gray-500 font-mono">
          {line.item.pointPrice.toLocaleString()}p × {line.qty} ={' '}
          <span className="text-amber-300 font-bold">
            {(line.item.pointPrice * line.qty).toLocaleString()}p
          </span>
        </p>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onDec}
          className="w-6 h-6 flex items-center justify-center bg-gray-900 hover:bg-gray-700 rounded text-gray-300"
          aria-label="감소"
        >
          <Minus size={11} />
        </button>
        <span className="text-xs text-white font-mono w-6 text-center">{line.qty}</span>
        <button
          type="button"
          onClick={onInc}
          disabled={line.qty >= line.item.stock}
          className="w-6 h-6 flex items-center justify-center bg-gray-900 hover:bg-gray-700 disabled:bg-gray-900/50 disabled:text-gray-700 rounded text-gray-300"
          aria-label="증가"
        >
          <Plus size={11} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 text-gray-500 hover:text-red-400 p-1"
          aria-label="삭제"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}
