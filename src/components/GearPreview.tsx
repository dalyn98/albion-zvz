'use client'

import { useTranslations } from 'next-intl'
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
import ItemImage from './ItemImage'

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

export function SlotItem({ name, id, size }: { name: string | null; id: string | null; size: number }) {
  if (isFreeItem(name, id)) return <FreeBadge size={size} />
  return <ItemImage itemId={id} itemName={name} size={size} clickZoom />
}

// Multi-option preview: first item in the options list as the main image,
// with a "+N" badge overlay when there are more to pick from. Signals to the
// member that they'll be asked to pick at signup time without crowding the
// card with every option.
export function MultiOptionPreview({
  options,
  size,
}: {
  options: GearOption[]
  size: number
}) {
  const first = options[0]
  const extra = options.length - 1
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ItemImage itemId={first.id} itemName={stripTierPrefix(first.name)} size={size} clickZoom />
      {extra > 0 && (
        <span
          className="absolute -top-1 -right-1 bg-amber-500 text-black font-bold rounded-full px-1 leading-tight"
          style={{ fontSize: Math.max(11, Math.floor(size * 0.28)) }}
        >
          +{extra}
        </span>
      )}
    </div>
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
}: {
  slot: GearPreviewSlot
  kind: SlotKey
  size: number
  isTaken: boolean
}) {
  const options = getGearOptions(slot, kind)
  // Only show the multi-option preview when nothing has been assigned yet;
  // once a member picks, their choice lives in assigned_{kind}_* and the
  // normal display takes over.
  const display = getDisplayGear(slot, kind)
  const showOptionsPreview = !isTaken && !display.id && Array.isArray(options) && options.length > 0
  const spec = getSlotGearSpec(slot.gear_specs, kind)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {showOptionsPreview ? (
        <MultiOptionPreview options={options!} size={size} />
      ) : (
        <SlotItem name={display.name} id={display.id} size={size} />
      )}
      {spec && <SpecBadge spec={spec} slotKey={kind} size={size} />}
    </div>
  )
}
