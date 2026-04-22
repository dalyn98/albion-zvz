'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
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
  Check,
} from 'lucide-react'
import { submitShopOrder } from '@/app/actions/shop-member'

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
}

interface Props {
  items: CatalogItem[]
  balance: number
  isMember: boolean
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

export default function ShopCatalog({ items, balance, isMember }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<number | 'all'>('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [selected, setSelected] = useState<CatalogItem | null>(null)
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

  // 아이템 타일 클릭 → 상세 모달을 띄운다.
  // 이전엔 조용히 +1 하던 동작이었는데, 수량이 얼마나 담겼는지/얼마인지 감이 오지 않아
  // 상세 모달에서 수량을 명시적으로 확정하도록 바꿨다.
  const openItem = (item: CatalogItem) => {
    setSelected(item)
    setResult(null)
  }

  const upsertCart = (item: CatalogItem, qty: number) => {
    const clamped = Math.max(0, Math.min(item.stock, Math.floor(qty)))
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id)
      if (clamped === 0) return prev.filter((l) => l.item.id !== item.id)
      if (existing) {
        if (existing.qty === clamped) return prev
        return prev.map((l) => (l.item.id === item.id ? { ...l, qty: clamped } : l))
      }
      return [...prev, { item, qty: clamped }]
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

  return (
    <div className="space-y-4">
      {/* 상단 도구: 검색 + 티어 필터 + 잔액 + 장바구니 버튼 */}
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
          className="relative flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors"
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
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 sm:gap-2">
            {filtered.map((item) => (
              <ShopTile
                key={item.id}
                item={item}
                cartQty={cart.find((l) => l.item.id === item.id)?.qty ?? 0}
                onSelect={() => openItem(item)}
                disabled={!isMember}
              />
            ))}
          </div>
        )}
      </div>

      {/* 아이템 상세 모달 */}
      {selected && (
        <ItemDetailModal
          item={selected}
          initialQty={cart.find((l) => l.item.id === selected.id)?.qty ?? 1}
          balance={balance}
          isMember={isMember}
          onClose={() => setSelected(null)}
          onConfirm={(qty) => {
            upsertCart(selected, qty)
            setSelected(null)
          }}
        />
      )}

      {/* 장바구니 드로어 */}
      {cartOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/70 z-40"
            onClick={() => setCartOpen(false)}
          />
          <aside className="fixed top-0 right-0 h-dvh w-full max-w-md bg-gray-950 border-l border-gray-800 z-50 flex flex-col">
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

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {cart.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-10">장바구니가 비었습니다.</p>
              ) : (
                cart.map((line) => (
                  <CartLineRow
                    key={line.item.id}
                    line={line}
                    onInc={() => updateQty(line.item.id, 1)}
                    onDec={() => updateQty(line.item.id, -1)}
                    onRemove={() => removeLine(line.item.id)}
                  />
                ))
              )}
            </div>

            <div className="border-t border-gray-800 px-5 py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">총액</span>
                <span className="font-mono font-bold text-amber-300">
                  {totalPoints.toLocaleString()}p
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">잔액</span>
                <span
                  className={`font-mono ${insufficient ? 'text-red-400' : 'text-gray-300'}`}
                >
                  {balance.toLocaleString()}p
                  {insufficient && (
                    <span className="ml-1 text-red-400">(부족)</span>
                  )}
                </span>
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="관리자에게 전달할 메모 (선택)"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearCart}
                  disabled={pending || cart.length === 0}
                  className="text-xs text-gray-400 hover:text-red-300 disabled:text-gray-700 px-2"
                >
                  비우기
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={pending || cart.length === 0 || insufficient || !isMember}
                  className="ml-auto flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg text-sm"
                >
                  {pending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
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
          </aside>
        </>
      )}
    </div>
  )
}

function ShopTile({
  item,
  cartQty,
  onSelect,
  disabled,
}: {
  item: CatalogItem
  cartQty: number
  onSelect: () => void
  disabled: boolean
}) {
  const quality = QUALITY_LABELS[item.quality] ?? '일반'
  const ringClass = QUALITY_RING[item.quality] ?? QUALITY_RING[1]

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={`${item.nameKo}${item.enchant > 0 ? ` .${item.enchant}` : ''} / ${quality} / ${item.pointPrice.toLocaleString()}p / 재고 ${item.stock.toLocaleString()}`}
      className={`group relative flex flex-col rounded-md bg-[#1a140c] ring-1 ${ringClass} hover:ring-2 hover:ring-amber-300 transition-all overflow-hidden ${
        disabled ? 'opacity-70 cursor-not-allowed' : ''
      }`}
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.5)' }}
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
      </div>

      {/* 가격 바 (하단 전체 폭) — 가장 중요한 정보라 크고 선명하게 */}
      <div
        className="px-1.5 py-1 text-center border-t border-amber-400/30"
        style={{
          background:
            'linear-gradient(to bottom, rgba(245,158,11,0.18) 0%, rgba(180,83,9,0.28) 100%)',
        }}
      >
        <p className="text-[13px] sm:text-sm font-bold font-mono text-amber-200 leading-tight tracking-tight">
          {item.pointPrice.toLocaleString()}
          <span className="text-amber-300/70 text-[10px] ml-0.5">P</span>
        </p>
      </div>

      {/* 장바구니에 이미 담긴 수량 */}
      {cartQty > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-gray-950">
          {cartQty}
        </span>
      )}
    </button>
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
    <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-2 py-2">
      <div className="relative w-10 h-10 rounded bg-gray-950 flex-shrink-0">
        <Image
          src={imageUrl(line.item.uniqueName, line.item.enchant, line.item.quality, 48)}
          alt={line.item.nameKo}
          fill
          className="object-contain pixel-img"
          unoptimized
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate font-medium">
          {line.item.nameKo}
          {line.item.enchant > 0 && (
            <span className="text-amber-300 ml-1 font-mono">.{line.item.enchant}</span>
          )}
        </p>
        <p className="text-[11px] text-gray-500 font-mono">
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
          className="w-6 h-6 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
          aria-label="감소"
        >
          <Minus size={11} />
        </button>
        <span className="text-xs text-white font-mono w-6 text-center">{line.qty}</span>
        <button
          type="button"
          onClick={onInc}
          disabled={line.qty >= line.item.stock}
          className="w-6 h-6 flex items-center justify-center bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 disabled:text-gray-700 rounded text-gray-300"
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

function ItemDetailModal({
  item,
  initialQty,
  balance,
  isMember,
  onClose,
  onConfirm,
}: {
  item: CatalogItem
  initialQty: number
  balance: number
  isMember: boolean
  onClose: () => void
  onConfirm: (qty: number) => void
}) {
  const startQty = Math.max(1, Math.min(item.stock, initialQty))
  const [qty, setQty] = useState<number>(startQty)
  const [qtyInput, setQtyInput] = useState<string>(String(startQty))
  const alreadyInCart = initialQty > 0

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const clampQty = (v: number): number => Math.max(0, Math.min(item.stock, Math.floor(v)))
  const bumpQty = (delta: number) => {
    const next = clampQty(qty + delta)
    setQty(next)
    setQtyInput(String(next))
  }
  const commitInput = () => {
    const parsed = Number(qtyInput)
    if (!Number.isFinite(parsed)) {
      setQty(1)
      setQtyInput('1')
      return
    }
    const clamped = clampQty(parsed)
    setQty(clamped)
    setQtyInput(String(clamped))
  }

  const quality = QUALITY_LABELS[item.quality] ?? '일반'
  const ringClass = QUALITY_RING[item.quality] ?? QUALITY_RING[1]
  const total = qty * item.pointPrice
  const insufficient = total > balance
  // 0 으로 낮춰 저장하면 장바구니에서 제외 → 문구만 "제거" 로 바꿔 의도를 명확히 표시.
  const actionLabel = qty === 0 ? '장바구니에서 제거' : alreadyInCart ? '수량 업데이트' : '장바구니에 담기'
  const confirmDisabled =
    !isMember ||
    (qty === 0 && !alreadyInCart) ||
    (qty > 0 && insufficient)

  return (
    <>
      <div
        className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.nameKo}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-gray-950 border border-gray-700 rounded-2xl z-50 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h3 className="font-bold text-white truncate pr-2">
            {item.nameKo}
            {item.enchant > 0 && (
              <span className="text-cyan-300 ml-1 font-mono">.{item.enchant}</span>
            )}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded flex-shrink-0"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-4">
            <div
              className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-lg bg-[#1a140c] ring-2 ${ringClass} flex-shrink-0`}
            >
              <Image
                src={imageUrl(item.uniqueName, item.enchant, item.quality, 128)}
                alt={item.nameKo}
                fill
                className="object-contain p-2 pixel-img"
                sizes="128px"
                unoptimized
              />
            </div>
            <div className="flex-1 min-w-0 space-y-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {item.tier !== null && (
                  <span className="text-[11px] font-mono bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-0.5">
                    T{item.tier}
                  </span>
                )}
                <span className="text-[11px] font-mono bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-0.5">
                  {quality}
                </span>
                {item.enchant > 0 && (
                  <span className="text-[11px] font-mono bg-gray-800 border border-cyan-700/60 text-cyan-200 rounded px-2 py-0.5">
                    +{item.enchant}
                  </span>
                )}
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">단가</p>
                <p className="text-xl font-bold font-mono text-amber-300">
                  {item.pointPrice.toLocaleString()}
                  <span className="text-amber-400/70 text-sm ml-1">P</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">재고</p>
                <p className="text-sm font-mono text-gray-200">
                  {item.stock.toLocaleString()}개
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">수량</span>
              {alreadyInCart && (
                <span className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-0.5">
                  장바구니에 {initialQty}개 담김
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => bumpQty(-1)}
                disabled={qty <= 0}
                className="w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/40 disabled:text-gray-700 rounded-lg text-gray-200"
                aria-label="감소"
              >
                <Minus size={16} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={item.stock}
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                onBlur={commitInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitInput()
                  }
                }}
                className="w-20 h-10 bg-gray-800 border border-gray-700 rounded-lg text-center text-white font-mono font-bold text-lg focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => bumpQty(1)}
                disabled={qty >= item.stock}
                className="w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/40 disabled:text-gray-700 rounded-lg text-gray-200"
                aria-label="증가"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] justify-center">
              <button
                type="button"
                onClick={() => {
                  setQty(item.stock)
                  setQtyInput(String(item.stock))
                }}
                className="text-gray-400 hover:text-amber-300 bg-gray-800 hover:bg-gray-700 rounded px-2 py-0.5"
              >
                최대 ({item.stock.toLocaleString()})
              </button>
            </div>

            <div className="border-t border-gray-800 pt-3 space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-400">총액</span>
                <span className="font-mono font-bold text-amber-300 text-lg">
                  {total.toLocaleString()}
                  <span className="text-amber-400/70 text-sm ml-1">P</span>
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">내 잔액</span>
                <span
                  className={`font-mono ${insufficient && qty > 0 ? 'text-red-400' : 'text-gray-400'}`}
                >
                  {balance.toLocaleString()}P
                  {insufficient && qty > 0 && (
                    <span className="ml-1 text-red-400">(부족)</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {!isMember && (
            <p className="text-[11px] text-amber-300/80 text-center">
              길드원으로 인증된 계정만 담을 수 있습니다.
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-gray-200 px-3 py-2"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => onConfirm(qty)}
              disabled={confirmDisabled}
              className={`ml-auto flex items-center gap-2 font-bold px-5 py-2.5 rounded-lg text-sm transition-colors ${
                qty === 0
                  ? 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 disabled:bg-gray-800 disabled:text-gray-600 disabled:border-gray-800'
                  : 'bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black'
              }`}
            >
              {qty === 0 ? <Trash2 size={14} /> : <Check size={14} />}
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

