'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { GearOption, GearSpec, Slot, SlotKey, SlotRole, SlotSpells } from '@/types'
import {
  SLOT_KEYS,
  getDisplayGear,
  getPrimaryGearKind,
  getRoleStyle,
  isFreeItem,
} from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
import { getLocalizedItemName } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import GearPreview from './GearPreview'
import SlotSpellPanel, { SlotCooldownBadge } from './SlotSpellPanel'
import type { SlotInput } from './SlotEditor'

// Roles that get the CD badge treatment in the event detail UI. The real
// value is fetched from app_settings at render time on the server, but for
// the admin preview we mirror the default so the editor feels faithful
// without an extra round-trip.
const CD_BADGE_ROLES: readonly SlotRole[] = ['Dps']

// Converts the editor's nested SlotInput to a read-only Slot shape that the
// preview components (GearPreview, SlotSpellPanel) already know how to render.
// All assigned_*/requested_* fields stay null — the preview always renders
// the admin-defined build, never a member's current pick.
function buildDisplaySlot(input: SlotInput): Slot {
  const flat: Record<string, unknown> = {
    id: 'preview',
    party_id: 'preview',
    slot_number: input.slot_number,
    is_hidden: input.is_hidden,
    role_name: input.role_name || null,
    notes: input.notes || null,
    auto_regear_excluded: input.auto_regear_excluded,
    manual_regear_excluded: input.manual_regear_excluded,
    assigned_discord_id: null,
    assigned_username: null,
    requested_discord_id: null,
    requested_username: null,
    requested_picks: null,
    requested_at: null,
  }

  for (const key of SLOT_KEYS) {
    const item = input.items[key]
    const opts = input.options[key]
    const hasOptions = Array.isArray(opts) && opts.length > 0
    // When options are set, the fixed item fields should be null — mirrors
    // the server-side slotToRow convention so getGearOptions wins in display.
    flat[`${key}_name`] = hasOptions ? null : item.name || null
    flat[`${key}_id`] = hasOptions ? null : item.id || null
    flat[`${key}_options`] = hasOptions
      ? opts.map((o: GearOption) => ({ ...o, spells: o.spells ? [...o.spells] : undefined }))
      : null
    flat[`assigned_${key}_name`] = null
    flat[`assigned_${key}_id`] = null
  }

  const spells: SlotSpells = {}
  for (const key of SLOT_KEYS) {
    const list = input.spells[key]
    if (Array.isArray(list) && list.length > 0) spells[key] = [...list]
  }
  flat.spells = Object.keys(spells).length > 0 ? spells : null

  const specs: Partial<Record<SlotKey, GearSpec>> = {}
  for (const key of SLOT_KEYS) {
    const spec = input.specs[key]
    if (!spec) continue
    const clean: GearSpec = {}
    if (typeof spec.tier === 'number') clean.tier = spec.tier
    if (typeof spec.enchant === 'number') clean.enchant = spec.enchant
    if (clean.tier != null || clean.enchant != null) specs[key] = clean
  }
  flat.gear_specs = Object.keys(specs).length > 0 ? specs : null

  return flat as unknown as Slot
}

export default function BuildPreview({ slot: input }: { slot: SlotInput }) {
  const t = useTranslations('adminParty')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const displaySlot = useMemo(() => buildDisplaySlot(input), [input])
  const primaryKind = getPrimaryGearKind(input.role_name)
  const primaryDisplay = getDisplayGear(displaySlot, primaryKind)
  const otherKeys = SLOT_KEYS.filter((k) => k !== primaryKind)
  const roleStyle = getRoleStyle(input.role_name)

  const hasAnyContent = SLOT_KEYS.some((k) => {
    const item = input.items[k]
    const opts = input.options[k]
    if (Array.isArray(opts) && opts.length > 0) return true
    return !!item.id || isFreeItem(item.name, item.id)
  })

  return (
    <div className="rounded-xl p-2.5 space-y-2 border bg-gray-900/60 border-gray-700">
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">
          {t('previewLabel')}
        </span>
        {input.role_name && (
          <span
            className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
              roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {input.role_name}
          </span>
        )}
      </div>

      {hasAnyContent ? (
        <>
          <div className="grid grid-cols-4 gap-1">
            <div className="col-span-2 row-span-2 flex items-center justify-center">
              <GearPreview slot={displaySlot} kind={primaryKind} size={55} isTaken={false} />
            </div>
            {otherKeys.map((key) => (
              <div key={key} className="flex items-center justify-center">
                <GearPreview slot={displaySlot} kind={key} size={31} isTaken={false} />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <SlotSpellPanel slot={displaySlot} cdBadgeRoles={CD_BADGE_ROLES} />
            <SlotCooldownBadge slot={displaySlot} cdBadgeRoles={CD_BADGE_ROLES} />
          </div>

          {primaryDisplay.name && !isFreeItem(primaryDisplay.name, primaryDisplay.id) && (
            <p className="text-white text-[12px] font-medium truncate leading-tight">
              {stripTierPrefix(
                getLocalizedItemName(primaryDisplay.id, locale, primaryDisplay.name) ??
                  primaryDisplay.name,
              )}
            </p>
          )}
        </>
      ) : (
        <p className="text-gray-500 text-[11px] text-center py-4 italic">
          {t('previewEmpty')}
        </p>
      )}
    </div>
  )
}
