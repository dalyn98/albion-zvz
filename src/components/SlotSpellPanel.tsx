'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import ItemImage from './ItemImage'
import SpellImage from './SpellImage'
import type { Slot, SlotKey, SlotRole } from '@/types'
import { getSpells, getDisplayGear, getGearOptions, isFreeItem } from '@/types'
import spellSlotsJson from '@/data/albion-spell-slots.json'
import { computeEffectiveCd, isCdTargetSpell, formatCooldown } from '@/lib/cooldown'

// Rows appear in this fixed top-to-bottom order. Offhand/potion/food/cape
// are omitted because they carry no active spells in practice; if we ever
// store spells there, they'd silently vanish from this panel — catch it
// in review.
const SPELL_ROW_KEYS = ['weapon', 'head', 'armor', 'shoes'] as const
type SpellRowKey = (typeof SPELL_ROW_KEYS)[number]

const GEAR_ICON_SIZE = 47
const SPELL_ICON_SIZE = 45

type RowItem = { key: SpellRowKey; name: string | null; id: string | null; spells: string[] }

// 각 gear key 에 대해 뷰어에 표시할 행을 계산한다.
//   1) options[key] 가 있는 multi 모드:
//      - 배정된 멤버가 있으면 assigned_{key}_id 에 해당하는 옵션 한 줄
//      - 배정 전이면 spells 가 지정된 모든 옵션을 각각 한 줄로
//   2) 그 외 (single/free): 기존 동작 — 공용 slot.spells[key] 한 줄
// 어떤 경우든 spells 가 비어 있으면 행을 추가하지 않는다.
function rowsForKey(slot: Slot, key: SpellRowKey): RowItem[] {
  const slotKey = key as SlotKey
  const options = getGearOptions(slot, slotKey)
  if (options && options.length > 0) {
    const assignedId = slot[`assigned_${slotKey}_id`]
    if (assignedId) {
      const opt = options.find((o) => o.id === assignedId)
      if (!opt) return []
      const s = opt.spells ?? []
      if (s.length === 0) return []
      return [{ key, name: opt.name, id: opt.id, spells: s }]
    }
    const rows: RowItem[] = []
    for (const opt of options) {
      const s = opt.spells ?? []
      if (s.length === 0) continue
      rows.push({ key, name: opt.name, id: opt.id, spells: s })
    }
    return rows
  }
  const spells = getSpells(slot.spells, slotKey)
  if (spells.length === 0) return []
  const gear = getDisplayGear(slot, slotKey)
  return [{ key, ...gear, spells }]
}

// Derived at build time from items.xml — spell uniqueName → slot+type.
// Slot meaning depends on type: active → weapon Q/W/E position (1/2/3),
// passive → which passive slot a passive fills (1/2). null = no slot attr.
type SpellSlotInfo = { slot: number | null; type: 'active' | 'passive' }
const SPELL_SLOTS = spellSlotsJson as Record<string, SpellSlotInfo>

interface SpellGroup {
  key: string
  type: 'active' | 'passive'
  slot: number | null
  spellIds: string[]
}

// Groups spells sharing the same (type, slot) tuple. In Albion, spells in the
// same slot are mutually exclusive in-game — picking multiple in the admin
// editor means "member can choose any one of these", not "all are equipped".
function groupSpellsBySlot(spellIds: string[]): SpellGroup[] {
  const buckets = new Map<string, SpellGroup>()
  const order: string[] = []
  for (const id of spellIds) {
    const info = SPELL_SLOTS[id]
    const type = info?.type ?? 'active'
    const slot = info?.slot ?? null
    const key = `${type}:${slot ?? 'x'}`
    const existing = buckets.get(key)
    if (existing) {
      existing.spellIds.push(id)
      continue
    }
    buckets.set(key, { key, type, slot, spellIds: [id] })
    order.push(key)
  }
  return order.map((k) => buckets.get(k)!)
}

type SpellTranslator = ReturnType<typeof useTranslations>

function groupLabel(g: SpellGroup, tSpell: SpellTranslator): string {
  if (g.type === 'active') {
    return g.slot === null ? tSpell('active') : tSpell('activeSlot', { n: g.slot })
  }
  return g.slot === null ? tSpell('passive') : tSpell('passiveSlot', { n: g.slot })
}

// Badge overlay shown on the weapon's CD-target active spell icon (slot 3
// normally, slot 2 for basic Mace). Shows the effective cooldown after
// leather armor / food CDR modifiers, with a styled hover tooltip that
// breaks down each CDR source. Renders nothing when the spell isn't the
// CD-target, has no recastdelay, the row isn't a weapon row, or — per the
// multi-option rule — the member hasn't picked a weapon yet.
interface SpellIconProps {
  spellId: string
  slot: Slot
  size: number
  rowKey: SpellRowKey
  weaponItemId: string | null
  cdBadgeRoles: readonly SlotRole[]
  tSpell: SpellTranslator
  tGear: SpellTranslator
}
function SpellIconWithCd({
  spellId,
  slot,
  size,
  rowKey,
  weaponItemId,
  cdBadgeRoles,
  tSpell,
  tGear,
}: SpellIconProps) {
  const roleAllowed = !!slot.role_name && cdBadgeRoles.includes(slot.role_name as SlotRole)
  if (!roleAllowed || rowKey !== 'weapon' || !isCdTargetSpell(spellId, weaponItemId)) {
    return <SpellImage spellId={spellId} size={size} />
  }
  const cd = computeEffectiveCd(slot, spellId)
  if (!cd) {
    return <SpellImage spellId={spellId} size={size} />
  }
  const effective = formatCooldown(cd.effectiveCd)
  const offhandSource = cd.sources.find((s) => s.key === 'offhand')
  return (
    <div className="group/cd relative">
      <SpellImage spellId={spellId} size={size} />
      <span className="absolute bottom-0 right-0 text-[9px] font-bold leading-none px-1 py-[1px] rounded-sm bg-gray-950/90 text-cyan-300 border border-cyan-600/60 pointer-events-none tabular-nums">
        {effective}
      </span>
      <div
        role="tooltip"
        className="hidden group-hover/cd:block absolute z-40 bottom-full left-1/2 -translate-x-1/2 mb-1 w-[200px] bg-gray-950 border border-cyan-500/40 rounded-lg p-2 shadow-xl pointer-events-none space-y-1 text-[11px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-cyan-300 font-bold">{tSpell('cdLabel')}</span>
          <span className="text-white font-bold tabular-nums">{effective}</span>
        </div>
        {offhandSource && (
          <div className="inline-block text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-300 border border-amber-500/40">
            {tSpell('cdOffhandIncluded')}
          </div>
        )}
        <div className="flex items-center justify-between text-gray-400">
          <span>{tSpell('cdBase')}</span>
          <span className="tabular-nums">{formatCooldown(cd.baseCd)}</span>
        </div>
        {cd.sources.length > 0 && (
          <div className="pt-1 border-t border-gray-800 space-y-0.5">
            {cd.sources.map((src, idx) => {
              const offhandLabel =
                src.key === 'offhand' && src.offhandType
                  ? tSpell(`offhand_${src.offhandType}`)
                  : null
              return (
                <div
                  key={`${src.key}:${src.spell}:${idx}`}
                  className="flex items-center justify-between text-gray-300"
                >
                  <span>
                    {tGear(src.key)}
                    {offhandLabel ? (
                      <span className="text-amber-300"> ({offhandLabel})</span>
                    ) : null}
                  </span>
                  <span className="text-emerald-300 tabular-nums">
                    -{(src.cdr * 100).toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <div className="pt-1 border-t border-gray-800 text-[10px] text-gray-500 leading-tight">
          {tSpell('cdNote')}
        </div>
      </div>
    </div>
  )
}

// Displays a small "스킬" badge that reveals a 4-row gear+spells panel on
// hover/focus — mirrors NoteTooltip so mobile users get the same tap-to-open
// affordance across both info surfaces.
export default function SlotSpellPanel({
  slot,
  cdBadgeRoles,
}: {
  slot: Slot
  cdBadgeRoles: readonly SlotRole[]
}) {
  const tSpell = useTranslations('slot.spell')
  const tSlot = useTranslations('slot')
  const tGear = useTranslations('gear')
  const rows: RowItem[] = []
  for (const key of SPELL_ROW_KEYS) {
    rows.push(...rowsForKey(slot, key))
  }

  if (rows.length === 0) return null

  return (
    <div className="group/spells relative inline-block">
      <span
        tabIndex={0}
        role="button"
        aria-label={tSpell('view')}
        className="inline-flex items-center gap-0.5 text-[12px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-200 border border-purple-500/30 hover:bg-purple-500/20 cursor-help focus:outline-none focus:ring-1 focus:ring-purple-500/50"
      >
        <Sparkles size={10} />
        {tSpell('label')}
      </span>
      <div
        role="tooltip"
        className="hidden group-hover/spells:block group-focus-within/spells:block absolute z-30 top-full left-0 mt-1 min-w-[280px] max-w-[92vw] bg-gray-950 border border-purple-500/40 rounded-lg p-2 shadow-xl space-y-1.5"
      >
        {rows.map(({ key, name, id, spells }, idx) => (
          <div key={`${key}:${id ?? 'x'}:${idx}`} className="flex items-start gap-1.5">
            {isFreeItem(name, id) ? (
              <div
                style={{ width: GEAR_ICON_SIZE, height: GEAR_ICON_SIZE }}
                className="flex items-center justify-center rounded bg-emerald-900/30 border border-emerald-600/50 text-emerald-300 font-bold text-[10px] flex-shrink-0"
              >
                {tSlot('free')}
              </div>
            ) : (
              <div className="flex-shrink-0">
                <ItemImage itemId={id} itemName={name} size={GEAR_ICON_SIZE} />
              </div>
            )}
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-start">
              {groupSpellsBySlot(spells).map((group) => {
                const isMulti = group.spellIds.length > 1
                const label = groupLabel(group, tSpell)
                if (!isMulti) {
                  return (
                    <div key={group.key} className="flex gap-0.5" title={label}>
                      {group.spellIds.map((spellId) => (
                        <SpellIconWithCd
                          key={spellId}
                          spellId={spellId}
                          slot={slot}
                          size={SPELL_ICON_SIZE}
                          rowKey={key}
                          weaponItemId={id}
                          cdBadgeRoles={cdBadgeRoles}
                          tSpell={tSpell}
                          tGear={tGear}
                        />
                      ))}
                    </div>
                  )
                }
                return (
                  <div
                    key={group.key}
                    className="flex flex-col items-center gap-0.5"
                    title={tSpell('pickOneInGame', { label })}
                  >
                    <div className="flex gap-0.5 p-0.5 rounded-md border border-amber-500/50 bg-amber-500/10">
                      {group.spellIds.map((spellId) => (
                        <SpellIconWithCd
                          key={spellId}
                          spellId={spellId}
                          slot={slot}
                          size={SPELL_ICON_SIZE}
                          rowKey={key}
                          weaponItemId={id}
                          cdBadgeRoles={cdBadgeRoles}
                          tSpell={tSpell}
                          tGear={tGear}
                        />
                      ))}
                    </div>
                    <span className="text-amber-300 text-[10px] font-bold leading-none">
                      {tSpell('pickOne')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
