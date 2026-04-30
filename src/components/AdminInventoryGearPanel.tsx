'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Lock, Minus, Plus, Save, Search, Shield } from 'lucide-react'
import {
  GEAR_SLOTS,
  type GearArmorMaterial,
  type GearSlot,
  type InventoryGearBaseRow,
} from '@/lib/inventory'
import {
  ENCHANT_LEVELS,
  TIER_LEVELS,
  type EnchantLevel,
  type TierLevel,
} from '@/lib/inventory-catalog'
import { adjustGearAction, setGearAction } from '@/app/actions/inventory'
import { extractWeaponCategory } from '@/lib/weapon-category'
import { canonicalT8WeaponId, stripTierPrefix } from '@/lib/weapon-display'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import { useToast } from './ToastProvider'

interface Props {
  initialGear: InventoryGearBaseRow[]
}

interface CategorizedRow extends InventoryGearBaseRow {
  weaponCategory: string | null
  localizedName: string
  totalQty: number
}

const MATERIAL_BADGE_STYLE: Record<GearArmorMaterial, string> = {
  PLATE: 'bg-slate-500/15 text-slate-200 border-slate-500/40',
  LEATHER: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  CLOTH: 'bg-violet-500/15 text-violet-200 border-violet-500/40',
}

// 카탈로그 사이드는 고정이라 정렬은 슬롯 → 무기카테고리/재질 → 티어 desc → 이름.
function compareRows(a: CategorizedRow, b: CategorizedRow): number {
  const slotDiff = GEAR_SLOTS.indexOf(a.slot) - GEAR_SLOTS.indexOf(b.slot)
  if (slotDiff !== 0) return slotDiff
  const subA = a.weaponCategory ?? a.armorMaterial ?? ''
  const subB = b.weaponCategory ?? b.armorMaterial ?? ''
  if (subA < subB) return -1
  if (subA > subB) return 1
  const tierDiff = (b.tier ?? 0) - (a.tier ?? 0)
  if (tierDiff !== 0) return tierDiff
  return a.localizedName.localeCompare(b.localizedName)
}

const GRID_SLOT_FILTERS: ReadonlyArray<GearSlot> = [
  'weapon',
  'offhand',
  'head',
  'armor',
  'shoes',
]

export default function AdminInventoryGearPanel({ initialGear }: Props) {
  const t = useTranslations('adminInventory')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const router = useRouter()

  const [tierFilter, setTierFilterRaw] = useState<TierLevel>(8)
  const [slotFilter, setSlotFilterRaw] = useState<GearSlot>('weapon')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [hideEmpty, setHideEmpty] = useState<boolean>(false)
  // 무기 슬롯에서만 의미 있음. 슬롯/티어 변경 시 자동 null.
  const [weaponCategoryFilter, setWeaponCategoryFilter] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const gridRef = useRef<HTMLDivElement | null>(null)

  const setTierFilter = (tier: TierLevel) => {
    setTierFilterRaw(tier)
    setWeaponCategoryFilter(null)
  }
  const setSlotFilter = (slot: GearSlot) => {
    setSlotFilterRaw(slot)
    setWeaponCategoryFilter(null)
  }

  const rows = useMemo<CategorizedRow[]>(() => {
    return initialGear
      .map((r) => {
        const localizedName =
          getLocalizedItemNameWithEnchant(r.baseItemId, locale, null) ??
          r.baseItemId
        const weaponCategory =
          r.slot === 'weapon' || r.slot === 'offhand'
            ? extractWeaponCategory(r.baseItemId)
            : null
        const totalQty = ENCHANT_LEVELS.reduce<number>(
          (acc, lvl) => acc + r.quantities[lvl],
          0,
        )
        return { ...r, weaponCategory, localizedName, totalQty }
      })
      .sort(compareRows)
  }, [initialGear, locale])

  const trimmedQuery = searchQuery.trim().toLowerCase()
  const matchesSearch = (r: CategorizedRow) =>
    !trimmedQuery ||
    r.baseItemId.toLowerCase().includes(trimmedQuery) ||
    r.localizedName.toLowerCase().includes(trimmedQuery)

  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      if (r.tier !== tierFilter) return false
      if (r.slot !== slotFilter) return false
      if (
        slotFilter === 'weapon' &&
        weaponCategoryFilter &&
        r.weaponCategory !== weaponCategoryFilter
      ) {
        return false
      }
      if (hideEmpty && r.totalQty === 0) return false
      if (!matchesSearch(r)) return false
      return true
    })
    // matchesSearch 는 trimmedQuery 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tierFilter, slotFilter, weaponCategoryFilter, hideEmpty, trimmedQuery])

  // 무기 슬롯에서 보유/카탈로그에 등장하는 카테고리들 — 칩 라벨은 T8 canonical
  // 의 로컬라이즈 이름에서 "장로의 " 접두사를 떼서 표시.
  const weaponCategoryOptions = useMemo(() => {
    if (slotFilter !== 'weapon') return []
    const map = new Map<
      string,
      { count: number; sample: CategorizedRow }
    >()
    for (const r of rows) {
      if (r.tier !== tierFilter) continue
      if (r.slot !== 'weapon') continue
      if (!r.weaponCategory) continue
      const existing = map.get(r.weaponCategory)
      if (existing) {
        existing.count += r.totalQty
      } else {
        map.set(r.weaponCategory, { count: r.totalQty, sample: r })
      }
    }
    const out: Array<{ code: string; label: string; count: number }> = []
    for (const [code, data] of map) {
      const canonId =
        canonicalT8WeaponId(data.sample.baseItemId) ?? data.sample.baseItemId
      const localized =
        getLocalizedItemNameWithEnchant(canonId, locale, null) ?? code
      out.push({ code, label: stripTierPrefix(localized), count: data.count })
    }
    out.sort((a, b) => a.label.localeCompare(b.label))
    return out
  }, [rows, tierFilter, slotFilter, locale])

  // 슬롯 칩의 보유 합계 (현재 티어 한정)
  const countsBySlot = useMemo(() => {
    const counts: Record<GearSlot, number> = {
      weapon: 0,
      head: 0,
      armor: 0,
      shoes: 0,
      offhand: 0,
      cape: 0,
      bag: 0,
      other: 0,
    }
    for (const r of rows) {
      if (r.tier !== tierFilter) continue
      counts[r.slot] += r.totalQty
    }
    return counts
  }, [rows, tierFilter])

  // 검색 시 첫 매치 카드로 스크롤 — 그리드에서 핀포인트 조회를 가능하게.
  useEffect(() => {
    if (!trimmedQuery || !gridRef.current) return
    const el = gridRef.current.querySelector<HTMLElement>(
      '[data-search-match="true"]',
    )
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [trimmedQuery])

  const onAdjust = (itemId: string, delta: number) => {
    startTransition(async () => {
      const r = await adjustGearAction({ itemId, delta })
      if (r.error) toast.error(r.error)
      else router.refresh()
    })
  }

  const onSet = (itemId: string, qty: number) => {
    startTransition(async () => {
      const r = await setGearAction({ itemId, quantity: qty })
      if (r.error) toast.error(r.error)
      else router.refresh()
    })
  }

  const toast = useToast()

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Shield size={16} className="text-amber-400" />
          {t('gearTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('gearHintCatalog')}</p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-gray-950/40 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder:text-gray-500 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-gray-500 self-center mr-1 font-semibold uppercase tracking-wide">
            {t('tierLabel')}
          </span>
          {TIER_LEVELS.map((tier) => {
            const active = tierFilter === tier
            return (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(tier)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors tabular-nums ${
                  active
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                    : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                }`}
              >
                T{tier}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-gray-500 self-center mr-1 font-semibold uppercase tracking-wide">
            {t('slotLabel')}
          </span>
          {GRID_SLOT_FILTERS.map((s) => {
            const active = slotFilter === s
            const count = countsBySlot[s]
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSlotFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  active
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                    : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                }`}
              >
                <span>{t(`gearSlot.${s}`)}</span>
                <span
                  className={`text-[10px] tabular-nums ${active ? 'text-amber-300/80' : 'text-gray-500'}`}
                >
                  {count}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ml-auto ${
              hideEmpty
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
            }`}
          >
            {hideEmpty ? t('hideEmptyOn') : t('hideEmptyOff')}
          </button>
        </div>

        {slotFilter === 'weapon' && weaponCategoryOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-gray-500 self-center mr-1 font-semibold uppercase tracking-wide">
              {t('weaponCategoryLabel')}
            </span>
            <button
              type="button"
              onClick={() => setWeaponCategoryFilter(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                weaponCategoryFilter === null
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {t('weaponCategoryAll')}
            </button>
            {weaponCategoryOptions.map((opt) => {
              const active = weaponCategoryFilter === opt.code
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setWeaponCategoryFilter(opt.code)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    active
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`text-[10px] tabular-nums ${active ? 'text-amber-300/80' : 'text-gray-500'}`}
                  >
                    {opt.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {trimmedQuery && (
          <p className="text-xs text-gray-500 tabular-nums">
            {t('matchCount', { matched: visibleRows.length, total: rows.length })}
          </p>
        )}

        <p className="sm:hidden flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-950/40 border border-gray-800 rounded-lg px-3 py-2">
          <Lock size={12} />
          {t('mobileHint')}
        </p>

        {visibleRows.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-10">
            {hideEmpty ? t('emptyAfterFilter') : t('emptyAfterSearch')}
          </p>
        ) : (
          <div
            ref={gridRef}
            className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2"
          >
            {visibleRows.map((row, idx) => (
              <InventoryCard
                key={row.baseItemId}
                row={row}
                searching={Boolean(trimmedQuery)}
                searchMatched={!trimmedQuery || matchesSearch(row)}
                firstMatch={idx === 0}
                onAdjust={onAdjust}
                onSet={onSet}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

interface CardProps {
  row: CategorizedRow
  searching: boolean
  searchMatched: boolean
  firstMatch: boolean
  onAdjust: (itemId: string, delta: number) => void
  onSet: (itemId: string, qty: number) => void
}

const POPOVER_GAP = 8
const POPOVER_WIDTH = 320
const POPOVER_EST_HEIGHT = 380

function InventoryCard({
  row,
  searching,
  searchMatched,
  firstMatch,
  onAdjust,
  onSet,
}: CardProps) {
  const t = useTranslations('adminInventory')
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  })
  const wrapperRef = useRef<HTMLButtonElement | null>(null)

  const total = row.totalQty
  const isZero = total === 0
  const dimByMissedSearch = searching && !searchMatched
  const baseImageUrl = `https://render.albiononline.com/v1/item/${row.baseItemId}.png`

  function placePopover() {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const rightEdge = rect.right + POPOVER_GAP + POPOVER_WIDTH
    const showOnLeft = rightEdge > window.innerWidth
    const rawLeft = showOnLeft
      ? rect.left - POPOVER_GAP - POPOVER_WIDTH
      : rect.right + POPOVER_GAP
    setCoords({
      left: Math.max(8, Math.min(window.innerWidth - POPOVER_WIDTH - 8, rawLeft)),
      top: Math.max(
        8,
        Math.min(window.innerHeight - POPOVER_EST_HEIGHT - 8, rect.top),
      ),
    })
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (wrapperRef.current?.contains(target)) return
      const popover = document.querySelector(
        `[data-inventory-popover="${row.baseItemId}"]`,
      )
      if (popover && popover.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open, row.baseItemId])

  const handleClick = () => {
    if (open) {
      setOpen(false)
      return
    }
    placePopover()
    setOpen(true)
  }

  return (
    <>
      <button
        ref={wrapperRef}
        type="button"
        onClick={handleClick}
        data-search-match={searching && searchMatched && firstMatch ? 'true' : undefined}
        className={`relative flex flex-col rounded-lg border transition-colors ${
          searching && searchMatched
            ? 'border-amber-400/80 ring-2 ring-amber-400/30'
            : isZero
              ? 'border-gray-800 bg-gray-950/50'
              : 'border-gray-700 bg-gray-950'
        } ${dimByMissedSearch ? 'opacity-30' : ''} hover:border-amber-500/60`}
        aria-label={`${row.localizedName} (${total})`}
      >
        <div className="relative w-full aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={baseImageUrl}
            alt={row.localizedName}
            className={`absolute inset-0 w-full h-full object-contain p-1 pixel-img ${
              isZero ? 'opacity-30 grayscale' : ''
            }`}
            loading="lazy"
          />
          <span
            className={`absolute top-0.5 left-0.5 rounded px-1 py-0.5 text-[10px] font-bold tabular-nums leading-none ${
              isZero
                ? 'bg-gray-800/70 text-gray-500'
                : 'bg-amber-500/90 text-black'
            }`}
          >
            T{row.tier}
          </span>
        </div>
        <div className="grid grid-cols-5 border-t border-gray-800 text-[10px] tabular-nums">
          {ENCHANT_LEVELS.map((lvl) => {
            const q = row.quantities[lvl]
            const empty = q === 0
            return (
              <div
                key={lvl}
                className={`flex flex-col items-center justify-center py-1 ${
                  lvl < 4 ? 'border-r border-gray-800' : ''
                } ${empty ? 'text-gray-600' : 'text-amber-200 bg-amber-500/5'}`}
              >
                <span className="text-[9px] text-gray-500 leading-none">@{lvl}</span>
                <span className="font-bold leading-tight">{q}</span>
              </div>
            )
          })}
        </div>
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <CardPopover
              row={row}
              coords={coords}
              onAdjust={onAdjust}
              onSet={onSet}
              t={t}
            />,
            document.body,
          )
        : null}
    </>
  )
}

interface PopoverProps {
  row: CategorizedRow
  coords: { top: number; left: number }
  onAdjust: (itemId: string, delta: number) => void
  onSet: (itemId: string, qty: number) => void
  t: ReturnType<typeof useTranslations<'adminInventory'>>
}

function CardPopover({ row, coords, onAdjust, onSet, t }: PopoverProps) {
  return (
    <div
      data-inventory-popover={row.baseItemId}
      role="dialog"
      aria-label={row.localizedName}
      className="fixed z-[100] rounded-xl bg-gray-900 border border-gray-700 shadow-2xl p-3 space-y-3"
      style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
    >
      <div className="space-y-1">
        <p className="text-white text-sm font-medium leading-tight">
          {row.localizedName}
        </p>
        <p className="text-gray-500 text-[11px] font-mono leading-tight break-all">
          {row.baseItemId}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className="px-1.5 py-0.5 rounded border border-gray-700 text-gray-300">
          {t(`gearSlot.${row.slot}`)}
        </span>
        <span className="px-1.5 py-0.5 rounded border border-gray-700 text-gray-300 tabular-nums">
          T{row.tier}
        </span>
        {row.armorMaterial && (
          <span
            className={`px-1.5 py-0.5 rounded border ${MATERIAL_BADGE_STYLE[row.armorMaterial]}`}
          >
            {t(`armorMaterial.${row.armorMaterial}`)}
          </span>
        )}
      </div>

      <div className="hidden sm:flex sm:flex-col gap-1.5 border-t border-gray-800 pt-3">
        {ENCHANT_LEVELS.map((lvl) => (
          <EnchantRow
            key={lvl}
            level={lvl}
            qty={row.quantities[lvl]}
            itemId={lvl === 0 ? row.baseItemId : `${row.baseItemId}@${lvl}`}
            onAdjust={onAdjust}
            onSet={onSet}
            t={t}
          />
        ))}
      </div>

      <div className="sm:hidden border-t border-gray-800 pt-3">
        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
          <Lock size={12} />
          {t('mobileEditDisabled')}
        </p>
      </div>
    </div>
  )
}

interface EnchantRowProps {
  level: EnchantLevel
  qty: number
  itemId: string
  onAdjust: (itemId: string, delta: number) => void
  onSet: (itemId: string, qty: number) => void
  t: ReturnType<typeof useTranslations<'adminInventory'>>
}

function EnchantRow({ level, qty, itemId, onAdjust, onSet, t }: EnchantRowProps) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(qty))

  const handleSave = () => {
    const n = Number(draft)
    if (!Number.isInteger(n) || n < 0) {
      toast.error(t('errInvalidQty'))
      return
    }
    onSet(itemId, n)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-7 text-[11px] text-gray-500 font-mono tabular-nums">
        @{level}
      </span>
      <button
        type="button"
        onClick={() => onAdjust(itemId, -1)}
        className="p-1.5 rounded text-gray-400 hover:text-rose-300 hover:bg-rose-500/10 border border-gray-700"
        aria-label={t('btnMinus')}
      >
        <Minus size={12} />
      </button>
      {editing ? (
        <>
          <input
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') {
                setEditing(false)
                setDraft(String(qty))
              }
            }}
            className="flex-1 w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm text-center"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSave}
            className="p-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
            aria-label={t('btnSave')}
          >
            <Save size={12} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing(true)
            setDraft(String(qty))
          }}
          className={`flex-1 px-2 py-1 rounded font-mono font-bold tabular-nums text-center text-sm border border-gray-700 hover:bg-amber-500/10 ${
            qty === 0 ? 'text-gray-500' : 'text-amber-200'
          }`}
        >
          {qty}
        </button>
      )}
      <button
        type="button"
        onClick={() => onAdjust(itemId, 1)}
        className="p-1.5 rounded text-gray-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-gray-700"
        aria-label={t('btnPlus')}
      >
        <Plus size={12} />
      </button>
    </div>
  )
}
