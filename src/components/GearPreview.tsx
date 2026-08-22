'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import type { GearOption, GearSpec, SlotGearDisplay, SlotGearOptionsFields, SlotKey } from '@/types'
import {
  GEAR_ENCHANT_COLOR_CLASS,
  getDisplayGear,
  getGearOptions,
  getSlotGearSpec,
  isFreeItem,
  isTierlessSlot,
  specToFlat,
} from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
import { useItemNameResolver } from '@/lib/item-names-client'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import ItemImage from './ItemImage'

const OPTIONS_POPOVER_GAP = 8
const OPTIONS_POPOVER_WIDTH = 336
const OPTIONS_POPOVER_MAX_HEIGHT = 420

export function calculateGearOptionsPopoverPosition(input: {
  trigger: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>
  viewportWidth: number
  viewportHeight: number
  optionCount: number
}): { left: number; top: number; width: number; maxHeight: number } {
  const viewportPadding = 8
  const width = Math.min(
    OPTIONS_POPOVER_WIDTH,
    Math.max(0, input.viewportWidth - viewportPadding * 2),
  )
  const estimatedRows = Math.ceil(Math.max(1, input.optionCount) / 2)
  const estimatedHeight = Math.min(OPTIONS_POPOVER_MAX_HEIGHT, 92 + estimatedRows * 76)
  const centeredLeft = (input.trigger.left + input.trigger.right - width) / 2
  const left = Math.max(
    viewportPadding,
    Math.min(input.viewportWidth - width - viewportPadding, centeredLeft),
  )
  const belowTop = input.trigger.bottom + OPTIONS_POPOVER_GAP
  const hasRoomBelow = belowTop + estimatedHeight <= input.viewportHeight - viewportPadding
  const top = hasRoomBelow
    ? belowTop
    : Math.max(viewportPadding, input.trigger.top - OPTIONS_POPOVER_GAP - estimatedHeight)

  return {
    left,
    top,
    width,
    maxHeight: Math.max(160, input.viewportHeight - viewportPadding * 2),
  }
}

// Minimal shape needed to render GearPreview. Both the full Slot (event detail
// path) and the editor's display-slot (BuildPreview) fit this shape.
export interface GearPreviewSlot extends SlotGearDisplay, SlotGearOptionsFields {
  gear_specs: Partial<Record<SlotKey, GearSpec>> | null
}

export function FreeBadge({ size }: { size: number }) {
  const t = useTranslations('slot')
  return (
    <div
      className="flex items-center justify-center rounded-md bg-emerald-900/30 border border-emerald-600/50 text-emerald-300 font-bold"
      style={{ width: size, height: size, fontSize: size >= 44 ? 14 : 11 }}
    >
      {t('free')}
    </div>
  )
}

export function SlotItem({
  name,
  id,
  size,
  interactive = true,
}: {
  name: string | null
  id: string | null
  size: number
  interactive?: boolean
}) {
  if (isFreeItem(name, id)) return <FreeBadge size={size} />
  return <ItemImage itemId={id} itemName={name} size={size} clickZoom={interactive} />
}

// Multi-option preview: first item in the options list as the main image,
// with a "+N" badge overlay when there are more to pick from. Signals to the
// member that they'll be asked to pick at signup time without crowding the
// card with every option.
export function MultiOptionPreview({
  options,
  kind,
  size,
  interactive = true,
  optionsPopover = false,
}: {
  options: GearOption[]
  kind: SlotKey
  size: number
  interactive?: boolean
  optionsPopover?: boolean
}) {
  const first = options[0]
  const extra = options.length - 1
  const tSlot = useTranslations('slot')
  const tGear = useTranslations('gear')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const { getLocalizedItemName } = useItemNameResolver(locale)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({
    left: 8,
    top: 8,
    width: OPTIONS_POPOVER_WIDTH,
    maxHeight: OPTIONS_POPOVER_MAX_HEIGHT,
  })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const popoverId = useId()
  const canOpenOptions = interactive && optionsPopover && options.length > 1
  const gearLabel = tGear(kind)
  const optionsLabel = tSlot('multiRequired', { labels: gearLabel })

  const placePopover = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect()
    if (!trigger) return
    setPosition(calculateGearOptionsPopoverPosition({
      trigger,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      optionCount: options.length,
    }))
  }, [options.length])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const reposition = () => placePopover()
    document.addEventListener('pointerdown', closeOnOutside)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, placePopover])

  const preview = (
    <>
      <ItemImage
        itemId={first.id}
        itemName={stripTierPrefix(first.name)}
        size={size}
        clickZoom={interactive && !canOpenOptions}
      />
      {extra > 0 && (
        <span
          className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-amber-500 px-1 font-bold leading-tight text-black shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
          style={{ fontSize: Math.max(11, Math.floor(size * 0.28)) }}
        >
          +{extra}
        </span>
      )}
    </>
  )

  return (
    <>
      {canOpenOptions ? (
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${optionsLabel} · ${options.length}`}
          aria-expanded={open}
          aria-controls={popoverId}
          aria-haspopup="dialog"
          title={optionsLabel}
          onClick={() => {
            if (!open) placePopover()
            setOpen((current) => !current)
          }}
          className="relative rounded-lg outline-none transition-[transform,filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-amber-400/80 active:scale-[0.96]"
          style={{ width: size, height: size }}
        >
          {preview}
        </button>
      ) : (
        <div className="relative" style={{ width: size, height: size }}>
          {preview}
        </div>
      )}

      {canOpenOptions && open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-label={`${gearLabel} · ${options.length}`}
              className="fixed z-[120] overflow-hidden rounded-2xl bg-gray-950/95 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.58),0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-xl"
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: Math.min(position.maxHeight, OPTIONS_POPOVER_MAX_HEIGHT),
              }}
            >
              <div className="flex items-start justify-between gap-3 px-1 pb-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white text-balance">
                    {gearLabel} · {options.length}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-400 text-pretty">
                    {optionsLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    triggerRef.current?.focus()
                  }}
                  aria-label={tSlot('picker.close')}
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 transition-[background-color,color,transform] hover:bg-white/10 hover:text-white active:scale-[0.96]"
                >
                  <X size={17} />
                </button>
              </div>
              <ul className="grid max-h-[326px] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pr-1">
                {options.map((option) => {
                  const localizedName = stripTierPrefix(
                    getLocalizedItemName(option.id, locale, option.name) ?? option.name,
                  )
                  return (
                    <li
                      key={option.id}
                      className="flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.055] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
                    >
                      <ItemImage
                        itemId={option.id}
                        itemName={localizedName}
                        size={48}
                        clickZoom={false}
                      />
                      <span className="min-w-0 text-xs font-medium leading-snug text-gray-200 text-pretty">
                        {localizedName}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export function SpecBadge({ spec, slotKey, size }: { spec: GearSpec; slotKey: SlotKey; size: number }) {
  const { tier, enchant } = spec
  const enchantColor =
    enchant != null ? GEAR_ENCHANT_COLOR_CLASS[enchant] ?? 'text-white' : 'text-white'
  const fontSize = size >= 44 ? 11 : 9
  // Food/potion stay enchant-only — they have no tier concept (the tier is
  // baked into the item id), so "8F" makes no sense here.
  if (isTierlessSlot(slotKey)) {
    if (enchant == null) return null
    return (
      <span
        className={`absolute -bottom-1 -right-1 bg-black/85 border border-gray-700 font-mono font-bold rounded px-1 leading-tight ${enchantColor}`}
        style={{ fontSize }}
      >
        @{enchant}
      </span>
    )
  }
  const flat = specToFlat(spec)
  const text = flat != null
    ? `${flat}F`
    : tier != null
      ? `T${tier}`
      : enchant != null
        ? `@${enchant}`
        : null
  if (text == null) return null
  return (
    <span
      className={`absolute -bottom-1 -right-1 bg-black/85 border border-gray-700 font-mono font-bold rounded px-1 leading-tight ${enchantColor}`}
      style={{ fontSize }}
    >
      {text}
    </span>
  )
}

export default function GearPreview({
  slot,
  kind,
  size,
  isTaken,
  interactive = true,
  optionsPopover = false,
}: {
  slot: GearPreviewSlot
  kind: SlotKey
  size: number
  isTaken: boolean
  interactive?: boolean
  optionsPopover?: boolean
}) {
  const options = getGearOptions(slot, kind)
  // Only show the multi-option preview when nothing has been assigned yet;
  // once a member picks, their choice lives in assigned_{kind}_* and the
  // normal display takes over.
  const display = getDisplayGear(slot, kind)
  const showOptionsPreview = !isTaken && Array.isArray(options) && options.length > 0
  const spec = getSlotGearSpec(slot.gear_specs, kind)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {showOptionsPreview ? (
        <MultiOptionPreview
          options={options!}
          kind={kind}
          size={size}
          interactive={interactive}
          optionsPopover={optionsPopover}
        />
      ) : (
        <SlotItem name={display.name} id={display.id} size={size} interactive={interactive} />
      )}
      {spec && <SpecBadge spec={spec} slotKey={kind} size={size} />}
    </div>
  )
}
