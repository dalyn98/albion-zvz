'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
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
  Pencil,
  AlertTriangle,
} from 'lucide-react'
import { submitShopOrder } from '@/app/actions/shop-member'
import { getLocalizedItemName, stripLocalizedTierName } from '@/lib/item-names'
import { categorizeGearItem, type GearSlot } from '@/lib/inventory-types'
import type { Locale } from '@/i18n/locales'
import AlbionItemImage from './AlbionItemImage'
import HoverTip from './HoverTip'

export type ShopPriceWarning = 'quality' | 'window' | 'bluezone' | 'redzone' | null

// 서버측 shop-member.ts 의 MEMO_MAX 와 동기. 사용자가 입력 한도를 미리 보고
// 잘못 잘려나가는 일을 막기 위해 카운터로 노출.
const SHOP_NOTE_MAX = 500

export interface CatalogItem {
  id: string
  uniqueName: string
  enchant: number
  quality: number
  stock: number
  nameKo: string
  category: string | null
  tier: number | null
  pointPrice: number | null
  priceWarning: ShopPriceWarning
}

// AODP 폴백 단계별 경고 색상. 라벨과 툴팁 문구는 i18n (shop.priceWarning* 키).
// 색상으로 심각도만 차등 (노랑=경미, 주황=주의, 빨강=심각).
const PRICE_WARNING_COLOR: Record<NonNullable<ShopPriceWarning>, string> = {
  quality: 'bg-yellow-400 text-black',
  window: 'bg-yellow-400 text-black',
  bluezone: 'bg-orange-500 text-black',
  redzone: 'bg-red-600 text-white',
}

// quality 인덱스(0~5) → i18n 키 매핑. 0 / out-of-range 는 'unknown' 으로 폴백.
const QUALITY_KEYS = ['unknown', 'normal', 'good', 'outstanding', 'excellent', 'masterpiece'] as const
type QualityKey = (typeof QUALITY_KEYS)[number]
function qualityKey(idx: number): QualityKey {
  return QUALITY_KEYS[idx] ?? 'unknown'
}

interface Props {
  items: CatalogItem[]
  balance: number
  isMember: boolean
  // AODP 기준 도시 한글 라벨 — /shop 상단에 "시세 기준: ○○" 로 노출한다.
  baseCityLabel: string
  discountRate: number
  interactionMode?: 'live' | 'demo'
}

interface CartLine {
  item: CatalogDisplayItem
  qty: number
  quoteUnitSilver: string
  quoteCity: string
  quoteNote: string
  quoteEvidenceUrl: string
  quoteOpen: boolean
}

interface CatalogDisplayItem extends CatalogItem {
  displayName: string
  localizedName: string
  originalName: string
}

const QUALITY_RING: Record<number, string> = {
  1: 'ring-gray-500/60',
  2: 'ring-sky-300/70',
  3: 'ring-blue-400/80',
  4: 'ring-purple-400/80',
  5: 'ring-amber-300/90',
}

type ShopItemTypeKey =
  | GearSlot
  | 'mount'
  | 'potion'
  | 'food'

const SHOP_ITEM_TYPE_KEYS = new Set<string>([
  'weapon',
  'head',
  'armor',
  'shoes',
  'offhand',
  'cape',
  'bag',
  'mount',
  'potion',
  'food',
  'other',
])

function imageUrl(uniqueName: string, enchant: number, quality: number, size = 96): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: String(size) })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

function tierEnchantLabel(item: CatalogItem): string {
  if (item.tier == null) return '-'
  return `${item.tier}.${item.enchant}`
}

function shopItemTypeKey(item: CatalogItem): ShopItemTypeKey {
  const slot = categorizeGearItem(item.uniqueName).slot
  if (slot !== 'other') return slot
  const category = item.category?.toLowerCase()
  if (category && SHOP_ITEM_TYPE_KEYS.has(category)) {
    return category as ShopItemTypeKey
  }
  return 'other'
}

function parsePositiveIntegerInput(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

function quoteUnitPoints(line: CartLine, discountRate: number): number | null {
  const unitSilver = parsePositiveIntegerInput(line.quoteUnitSilver)
  if (unitSilver === null) return null
  return Math.max(1, Math.ceil(unitSilver * discountRate))
}

function lineOrderPoints(line: CartLine, discountRate: number): number | null {
  if (line.item.pointPrice !== null) return line.item.pointPrice * line.qty
  const quotePoints = quoteUnitPoints(line, discountRate)
  return quotePoints === null ? null : quotePoints * line.qty
}

export default function ShopCatalog({
  items,
  balance,
  isMember,
  baseCityLabel,
  discountRate,
  interactionMode = 'live',
}: Props) {
  const router = useRouter()
  const locale = useLocale() as Locale
  const t = useTranslations('shopCatalog')
  const tShop = useTranslations('shop')
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<number | 'all'>('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const localizedItems = useMemo<CatalogDisplayItem[]>(() => {
    return items.map((it) => {
      const localizedName = getLocalizedItemName(it.uniqueName, locale, it.nameKo) ?? it.nameKo
      const displayName = stripLocalizedTierName(localizedName, locale) || localizedName
      return {
        ...it,
        nameKo: localizedName,
        displayName,
        localizedName,
        originalName: it.nameKo,
      }
    })
  }, [items, locale])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return localizedItems.filter((it) => {
      if (tier !== 'all' && it.tier !== tier) return false
      if (!q) return true
      return (
        it.displayName.toLowerCase().includes(q) ||
        it.localizedName.toLowerCase().includes(q) ||
        it.originalName.toLowerCase().includes(q) ||
        it.uniqueName.toLowerCase().includes(q) ||
        tierEnchantLabel(it).includes(q) ||
        shopItemTypeKey(it).toLowerCase().includes(q)
      )
    })
  }, [localizedItems, query, tier])

  const totalQty = cart.reduce((s, l) => s + l.qty, 0)
  const totalPoints = cart.reduce((sum, line) => {
    const linePoints = lineOrderPoints(line, discountRate)
    return sum + (linePoints ?? 0)
  }, 0)
  const hasRequiredQuoteMissing = cart.some(
    (line) => line.item.pointPrice === null && quoteUnitPoints(line, discountRate) === null,
  )
  const hasInvalidOptionalQuote = cart.some(
    (line) => {
      const hasPriceInput = line.quoteUnitSilver.trim() !== ''
      const hasQuoteMeta =
        line.quoteCity.trim() !== '' ||
        line.quoteNote.trim() !== '' ||
        line.quoteEvidenceUrl.trim() !== ''
      return (
        (hasPriceInput && quoteUnitPoints(line, discountRate) === null) ||
        (!hasPriceInput && hasQuoteMeta)
      )
    },
  )
  const totalKnown = !hasRequiredQuoteMissing
  const insufficient = totalKnown && totalPoints > balance

  const addToCart = (item: CatalogDisplayItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id)
      if (!existing) {
        return [
          ...prev,
          {
            item,
            qty: 1,
            quoteUnitSilver: '',
            quoteCity: '',
            quoteNote: '',
            quoteEvidenceUrl: '',
            quoteOpen: item.pointPrice === null,
          },
        ]
      }
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

  const updateQuote = (
    id: string,
    patch: Partial<Pick<CartLine, 'quoteUnitSilver' | 'quoteCity' | 'quoteNote' | 'quoteEvidenceUrl' | 'quoteOpen'>>,
  ) => {
    setCart((prev) => prev.map((line) => (line.item.id === id ? { ...line, ...patch } : line)))
    setResult(null)
  }

  const clearCart = () => {
    setCart([])
    setNote('')
    setResult(null)
  }

  const handleSubmit = () => {
    if (cart.length === 0) return
    setResult(null)
    if (interactionMode === 'demo') {
      setCart([])
      setNote('')
      setCartOpen(false)
      setResult({ ok: true, message: t('orderSuccess') })
      return
    }
    startTransition(async () => {
      const res = await submitShopOrder(
        cart.map((l) => {
          const quoteSilver = parsePositiveIntegerInput(l.quoteUnitSilver)
          return {
            inventoryId: l.item.id,
            quantity: l.qty,
            memberQuoteUnitSilver: quoteSilver,
            memberQuoteCity: l.quoteCity.trim() || null,
            memberQuoteNote: l.quoteNote.trim() || null,
            memberQuoteEvidenceUrl: l.quoteEvidenceUrl.trim() || null,
          }
        }),
        note,
      )
      if (res.ok) {
        setCart([])
        setNote('')
        setCartOpen(false)
        setResult({ ok: true, message: t('orderSuccess') })
        router.refresh()
      } else {
        setResult({ ok: false, message: res.error ?? t('orderFailedDefault') })
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
          <span>{t('baseCityLabel')}</span>
          <span className="text-amber-300 font-semibold">{baseCityLabel}</span>
          <HoverTip
            label={tShop('aodpTooltip')}
            placement="bottom"
            triggerClassName="inline-flex items-center cursor-help text-gray-500"
          >
            <span aria-label={t('aodpAriaLabel')}>
              <Info size={12} />
            </span>
          </HoverTip>
        </div>
        {/* 상단 도구: 검색 + 티어 필터 + 잔액 + (모바일) 장바구니 버튼 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">{t('tierAll')}</option>
            {[3, 4, 5, 6, 7, 8].map((t) => (
              <option key={t} value={t}>
                T{t}
              </option>
            ))}
          </select>
          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
            <span className="text-gray-500">{t('balanceLabel')}</span>
            <span className="font-mono font-bold text-amber-300">{balance.toLocaleString()}p</span>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            disabled={totalQty === 0}
            className="lg:hidden relative flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <ShoppingCart size={14} />
            {t('cartButton')}
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

        <div className="rounded-xl border border-gray-800 bg-gray-900/40">
          {filtered.length === 0 ? (
            <p className="text-gray-300 text-base text-center py-12 font-medium">
              {items.length === 0 ? t('emptyStock') : t('emptySearch')}
            </p>
          ) : (
            <div className="divide-y divide-gray-800">
              {filtered.map((item) => (
                <ShopItemRow
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
          totalKnown={totalKnown}
          hasInvalidOptionalQuote={hasInvalidOptionalQuote}
          balance={balance}
          insufficient={insufficient}
          discountRate={discountRate}
          note={note}
          onNoteChange={setNote}
          onInc={(id) => updateQty(id, 1)}
          onDec={(id) => updateQty(id, -1)}
          onRemove={removeLine}
          onQuoteChange={updateQuote}
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
                {t('cartButton')}
              </h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="text-gray-400 hover:text-white p-1.5"
                aria-label={t('closeAriaLabel')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <CartPanel
                cart={cart}
                totalPoints={totalPoints}
                totalKnown={totalKnown}
                hasInvalidOptionalQuote={hasInvalidOptionalQuote}
                balance={balance}
                insufficient={insufficient}
                discountRate={discountRate}
                note={note}
                onNoteChange={setNote}
                onInc={(id) => updateQty(id, 1)}
                onDec={(id) => updateQty(id, -1)}
                onRemove={removeLine}
                onQuoteChange={updateQuote}
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

function ShopItemRow({
  item,
  cartQty,
  onAdd,
  disabled,
}: {
  item: CatalogDisplayItem
  cartQty: number
  onAdd: () => void
  disabled: boolean
}) {
  const t = useTranslations('shop')
  const tc = useTranslations('shopCatalog')
  const quality = t(`quality.${qualityKey(item.quality)}`)
  const typeLabel = tc(`itemType.${shopItemTypeKey(item)}`)
  const tierEnchant = tierEnchantLabel(item)
  const qualityRing = QUALITY_RING[item.quality] ?? QUALITY_RING[1]
  const inCart = cartQty > 0
  const atMax = cartQty >= item.stock

  const stockLabel = tc('tile.stockPrefix', { stock: item.stock.toLocaleString() })
  const cartLabel = inCart ? ` / ${tc('tile.cartPrefix', { qty: cartQty })}` : ''
  const resetLabel = atMax ? ` / ${tc('tile.resetHint')}` : ''
  const priceLabel =
    item.pointPrice === null
      ? tc('quoteRequired')
      : `${item.pointPrice.toLocaleString()}p`
  const ariaLabel = `${tierEnchant} ${item.displayName} / ${typeLabel} / ${quality} / ${priceLabel} / ${stockLabel}${cartLabel}${resetLabel}`

  return (
    <div
      className={`grid grid-cols-[2.75rem_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5 sm:grid-cols-[3rem_minmax(0,1fr)_5rem_5.5rem_4.75rem_auto] sm:px-4 transition-colors ${
        inCart ? 'bg-emerald-500/5' : 'hover:bg-gray-800/35'
      }`}
    >
      <div className={`relative h-11 w-11 sm:h-12 sm:w-12 rounded-md overflow-hidden bg-gray-950 ring-1 ${qualityRing} flex-shrink-0`}>
        <AlbionItemImage
          src={imageUrl(item.uniqueName, item.enchant, item.quality, 64)}
          alt={item.displayName}
          fill
          className="object-contain p-0.5 pixel-img"
          sizes="48px"
        />
        {inCart && (
          <span className="absolute -right-1 -bottom-1 min-w-5 rounded bg-emerald-500 px-1 text-center text-[11px] font-bold text-white ring-1 ring-emerald-300/70">
            ×{cartQty}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm sm:text-base font-bold text-amber-200 tabular-nums">
            {tierEnchant}
          </span>
          <span className="text-sm sm:text-[15px] font-semibold text-white truncate">
            {item.displayName}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
          <span className="rounded border border-gray-700 bg-gray-950/60 px-1.5 py-0.5 text-gray-300">
            {typeLabel}
          </span>
          <span className="sm:hidden">{quality}</span>
          <span className="sm:hidden">{stockLabel}</span>
          {item.priceWarning && (
            <HoverTip
              label={t(`priceWarningBuyer.${item.priceWarning}`)}
              placement="top"
              triggerClassName="inline-flex sm:hidden"
            >
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PRICE_WARNING_COLOR[item.priceWarning]}`}
              >
                {t('priceWarning')}
              </span>
            </HoverTip>
          )}
          {inCart && (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
              {tc('tile.cartPrefix', { qty: cartQty })}
            </span>
          )}
        </div>
      </div>

      <div className="hidden sm:block min-w-0">
        <p className="text-[11px] text-gray-500">{tc('qualityLabel')}</p>
        <p className="truncate text-xs font-medium text-gray-300">{quality}</p>
      </div>

      <div className="hidden sm:block text-right">
        <p className="text-[11px] text-gray-500">{tc('stockLabel')}</p>
        <p className="font-mono text-sm font-semibold text-gray-200">{item.stock.toLocaleString()}</p>
      </div>

      <div className="text-right">
        {item.pointPrice === null ? (
          <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
            <AlertTriangle size={10} />
            {tc('quoteRequired')}
          </span>
        ) : (
          <p className="font-mono text-sm sm:text-base font-bold text-amber-300">
            {item.pointPrice.toLocaleString()}
            <span className="ml-0.5 text-[10px] text-amber-300/70">P</span>
          </p>
        )}
        {item.priceWarning && (
          <HoverTip
            label={t(`priceWarningBuyer.${item.priceWarning}`)}
            placement="top"
            triggerClassName="hidden sm:inline-flex"
          >
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PRICE_WARNING_COLOR[item.priceWarning]}`}
            >
              {t('priceWarning')}
            </span>
          </HoverTip>
        )}
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          atMax
            ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            : 'bg-amber-500 text-black hover:bg-amber-400'
        } disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed`}
      >
        {atMax ? <X size={15} /> : <Plus size={15} />}
      </button>
    </div>
  )
}

function CartPanel({
  cart,
  totalPoints,
  totalKnown,
  hasInvalidOptionalQuote,
  balance,
  insufficient,
  discountRate,
  note,
  onNoteChange,
  onInc,
  onDec,
  onRemove,
  onQuoteChange,
  onClear,
  onSubmit,
  pending,
  isMember,
  variant = 'sidebar',
}: {
  cart: CartLine[]
  totalPoints: number
  totalKnown: boolean
  hasInvalidOptionalQuote: boolean
  balance: number
  insufficient: boolean
  discountRate: number
  note: string
  onNoteChange: (next: string) => void
  onInc: (id: string) => void
  onDec: (id: string) => void
  onRemove: (id: string) => void
  onQuoteChange: (
    id: string,
    patch: Partial<Pick<CartLine, 'quoteUnitSilver' | 'quoteCity' | 'quoteNote' | 'quoteEvidenceUrl' | 'quoteOpen'>>,
  ) => void
  onClear: () => void
  onSubmit: () => void
  pending: boolean
  isMember: boolean
  variant?: 'sidebar' | 'drawer'
}) {
  const t = useTranslations('shopCatalog')
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
            {t('cartButton')}
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
          <p className="text-gray-300 text-sm text-center py-10">
            {t('cart.empty')}
          </p>
        ) : (
          cart.map((line) => (
            <CartLineRow
              key={line.item.id}
              line={line}
              discountRate={discountRate}
              onInc={() => onInc(line.item.id)}
              onDec={() => onDec(line.item.id)}
              onRemove={() => onRemove(line.item.id)}
              onQuoteChange={(patch) => onQuoteChange(line.item.id, patch)}
            />
          ))
        )}
      </div>

      <div className="border-t border-gray-800 px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{t('cart.totalLabel')}</span>
          <span className="font-mono font-bold text-amber-300">
            {totalKnown ? `${totalPoints.toLocaleString()}p` : t('cart.quotePendingTotal')}
          </span>
        </div>
        {!totalKnown && (
          <p className="flex items-center gap-1 text-[11px] text-amber-300/90">
            <AlertTriangle size={11} />
            {t('cart.quoteRequiredHint')}
          </p>
        )}
        {hasInvalidOptionalQuote && (
          <p className="flex items-center gap-1 text-[11px] text-red-300">
            <AlertTriangle size={11} />
            {t('cart.quoteInvalidHint')}
          </p>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">{t('balanceLabel')}</span>
          <span className={`font-mono ${insufficient ? 'text-red-400' : 'text-gray-300'}`}>
            {balance.toLocaleString()}p
            {insufficient && <span className="ml-1 text-red-400">{t('cart.insufficient')}</span>}
          </span>
        </div>

        <div className="space-y-1">
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value.slice(0, SHOP_NOTE_MAX))}
            rows={2}
            maxLength={SHOP_NOTE_MAX}
            placeholder={t('cart.notePlaceholder')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
          />
          <div className="flex justify-end">
            <span
              className={`text-[10px] tabular-nums ${
                note.length >= SHOP_NOTE_MAX ? 'text-red-400' : 'text-gray-500'
              }`}
            >
              {note.length} / {SHOP_NOTE_MAX}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={pending || cart.length === 0}
            className="text-[11px] text-gray-400 hover:text-red-300 disabled:text-gray-700 px-2"
          >
            {t('cart.clearButton')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={
              pending ||
              cart.length === 0 ||
              insufficient ||
              !isMember ||
              !totalKnown ||
              hasInvalidOptionalQuote
            }
            className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-3.5 py-1.5 rounded-lg text-xs"
          >
            {pending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Send size={12} />
            )}
            {t('cart.submitButton')}
          </button>
        </div>

        {!isMember && (
          <p className="text-[11px] text-amber-300/80">
            {t('cart.notMemberHint')}
          </p>
        )}
      </div>
    </div>
  )
}

function CartLineRow({
  line,
  discountRate,
  onInc,
  onDec,
  onRemove,
  onQuoteChange,
}: {
  line: CartLine
  discountRate: number
  onInc: () => void
  onDec: () => void
  onRemove: () => void
  onQuoteChange: (
    patch: Partial<Pick<CartLine, 'quoteUnitSilver' | 'quoteCity' | 'quoteNote' | 'quoteEvidenceUrl' | 'quoteOpen'>>,
  ) => void
}) {
  const t = useTranslations('shopCatalog.cart')
  const tierEnchant = tierEnchantLabel(line.item)
  const displayName = line.item.displayName
  const quotePoints = quoteUnitPoints(line, discountRate)
  const quoteRequired = line.item.pointPrice === null
  const quoteOpen = quoteRequired || line.quoteOpen
  const quoteInvalid = line.quoteUnitSilver.trim() !== '' && quotePoints === null
  return (
    <div className="bg-gray-800/60 border border-gray-800 rounded-lg px-2 py-1.5 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative w-9 h-9 rounded bg-gray-950 flex-shrink-0">
          <AlbionItemImage
            src={imageUrl(line.item.uniqueName, line.item.enchant, line.item.quality, 48)}
            alt={displayName}
            fill
            className="object-contain pixel-img"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex min-w-0 items-center gap-1 text-[11px] text-white font-medium">
            {tierEnchant !== '-' && (
              <span className="flex-shrink-0 font-mono text-amber-200">{tierEnchant}</span>
            )}
            <span className="truncate">{displayName}</span>
          </p>
          <p className="text-[10px] text-gray-500 font-mono">
            {line.item.pointPrice === null ? (
              <span className="text-amber-300">{t('quoteRequiredLine')}</span>
            ) : (
              <>
                {line.item.pointPrice.toLocaleString()}p × {line.qty} ={' '}
                <span className="text-amber-300 font-bold">
                  {(line.item.pointPrice * line.qty).toLocaleString()}p
                </span>
              </>
            )}
          </p>
          {!quoteRequired && !quoteOpen && (
            <button
              type="button"
              onClick={() => onQuoteChange({ quoteOpen: true })}
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-amber-300"
            >
              <Pencil size={10} />
              {t('openQuoteButton')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onDec}
            className="w-6 h-6 flex items-center justify-center bg-gray-900 hover:bg-gray-700 rounded text-gray-300"
            aria-label={t('decAriaLabel')}
          >
            <Minus size={11} />
          </button>
          <span className="text-xs text-white font-mono w-6 text-center">{line.qty}</span>
          <button
            type="button"
            onClick={onInc}
            disabled={line.qty >= line.item.stock}
            className="w-6 h-6 flex items-center justify-center bg-gray-900 hover:bg-gray-700 disabled:bg-gray-900/50 disabled:text-gray-700 rounded text-gray-300"
            aria-label={t('incAriaLabel')}
          >
            <Plus size={11} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="ml-1 text-gray-500 hover:text-red-400 p-1"
            aria-label={t('removeAriaLabel')}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {quoteOpen && (
        <div className="space-y-1.5 border-t border-gray-700/70 pt-2">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              value={line.quoteUnitSilver}
              onChange={(e) => onQuoteChange({ quoteUnitSilver: e.target.value })}
              placeholder={t('quoteUnitSilverPlaceholder')}
              className={`min-w-0 flex-1 bg-gray-900 border rounded px-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none ${
                quoteInvalid || (quoteRequired && quotePoints === null)
                  ? 'border-red-500/60 focus:border-red-400'
                  : 'border-gray-700 focus:border-amber-500'
              }`}
            />
            <span className="w-20 text-right text-[10px] font-mono text-amber-300">
              {quotePoints !== null ? `${quotePoints.toLocaleString()}p` : t('quotePending')}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <input
              type="text"
              value={line.quoteCity}
              onChange={(e) => onQuoteChange({ quoteCity: e.target.value.slice(0, 40) })}
              placeholder={t('quoteCityPlaceholder')}
              className="min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            <input
              type="url"
              value={line.quoteEvidenceUrl}
              onChange={(e) => onQuoteChange({ quoteEvidenceUrl: e.target.value.slice(0, 300) })}
              placeholder={t('quoteEvidenceUrlPlaceholder')}
              className="min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={line.quoteNote}
              onChange={(e) => onQuoteChange({ quoteNote: e.target.value.slice(0, 200) })}
              placeholder={t('quoteNotePlaceholder')}
              className="min-w-0 flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            {!quoteRequired && (
              <button
                type="button"
                onClick={() =>
                  onQuoteChange({
                    quoteOpen: false,
                    quoteUnitSilver: '',
                    quoteCity: '',
                    quoteNote: '',
                    quoteEvidenceUrl: '',
                  })
                }
                className="px-1.5 py-1 text-[10px] text-gray-500 hover:text-gray-300"
              >
                {t('closeQuoteButton')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
