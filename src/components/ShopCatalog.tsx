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
} from 'lucide-react'
import { submitShopOrder } from '@/app/actions/shop-member'

export interface CatalogItem {
  id: string
  uniqueName: string
  enchant: number
  quality: number
  stock: number
  nameKo: string
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
      if (existing) {
        const nextQty = Math.min(item.stock, existing.qty + 1)
        if (nextQty === existing.qty) return prev
        return prev.map((l) => (l.item.id === item.id ? { ...l, qty: nextQty } : l))
      }
      return [...prev, { item, qty: 1 }]
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
                onAdd={() => addToCart(item)}
                disabled={!isMember}
              />
            ))}
          </div>
        )}
      </div>

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
  onAdd,
  disabled,
}: {
  item: CatalogItem
  cartQty: number
  onAdd: () => void
  disabled: boolean
}) {
  const quality = QUALITY_LABELS[item.quality] ?? '일반'
  const ringClass = QUALITY_RING[item.quality] ?? QUALITY_RING[1]

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      title={`${item.nameKo}${item.enchant > 0 ? ` .${item.enchant}` : ''} / ${quality} / ${item.pointPrice.toLocaleString()}p`}
      className={`group relative aspect-square rounded-md bg-[#1a140c] ring-1 ${ringClass} hover:ring-2 hover:ring-amber-300 transition-all ${
        disabled ? 'opacity-70 cursor-not-allowed' : ''
      }`}
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.5)' }}
    >
      <div className="absolute inset-0 flex items-center justify-center p-1">
        <Image
          src={imageUrl(item.uniqueName, item.enchant, item.quality, 96)}
          alt={item.nameKo}
          fill
          className="object-contain p-1 pixel-img"
          sizes="100px"
          unoptimized
        />
      </div>

      {/* 재고 수량 (오른쪽 아래) */}
      <span className="absolute bottom-0.5 right-1 text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        {item.stock.toLocaleString()}
      </span>

      {/* 포인트 가격 (왼쪽 위) */}
      <span className="absolute top-0.5 left-1 text-[10px] font-mono text-amber-300 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
        {item.pointPrice.toLocaleString()}p
      </span>

      {/* 인챈트 인디케이터 (왼쪽 아래) */}
      {item.enchant > 0 && (
        <span className="absolute bottom-0.5 left-1 text-[10px] font-bold text-cyan-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          .{item.enchant}
        </span>
      )}

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

