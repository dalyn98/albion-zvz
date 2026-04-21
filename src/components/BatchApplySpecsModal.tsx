'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import type { SlotInput } from './SlotEditor'
import type { SlotKey, SlotRole, GearSpec } from '@/types'
import {
  SLOT_ROLES,
  GEAR_TIER_MIN,
  GEAR_TIER_MAX,
  GEAR_ENCHANT_MIN,
  GEAR_ENCHANT_MAX,
  GEAR_ENCHANT_COLOR_CLASS,
} from '@/types'

export type BatchSpecsScope = 'all' | SlotRole

// Grouped input: admin specifies one (tier, enchant) pair per group; the modal
// expands that to each member SlotKey on apply. Food and potion are tierless
// because their item id already carries the tier (e.g. T8 Roast Beef).
interface BatchGroup {
  id: 'weapon' | 'armor' | 'cape' | 'mount' | 'food' | 'potion'
  labelKey: string
  keys: SlotKey[]
  includeTier: boolean
}

const BATCH_GROUPS: BatchGroup[] = [
  { id: 'weapon', labelKey: 'batchGroupWeapon', keys: ['weapon', 'offhand'], includeTier: true },
  { id: 'armor',  labelKey: 'batchGroupArmor',  keys: ['head', 'armor', 'shoes'], includeTier: true },
  { id: 'cape',   labelKey: 'batchGroupCape',   keys: ['cape'], includeTier: true },
  { id: 'mount',  labelKey: 'batchGroupMount',  keys: ['mount'], includeTier: true },
  { id: 'food',   labelKey: 'batchGroupFood',   keys: ['food'], includeTier: false },
  { id: 'potion', labelKey: 'batchGroupPotion', keys: ['potion'], includeTier: false },
]

type GroupSpecState = Record<BatchGroup['id'], GearSpec>

const EMPTY_GROUP_SPECS: GroupSpecState = {
  weapon: {},
  armor: {},
  cape: {},
  mount: {},
  food: {},
  potion: {},
}

interface Props {
  slots: SlotInput[]
  onApply: (scope: BatchSpecsScope, specs: Partial<Record<SlotKey, GearSpec>>) => void
  onClose: () => void
}

export default function BatchApplySpecsModal({ slots, onApply, onClose }: Props) {
  const t = useTranslations('adminParty')
  const tCommon = useTranslations('common')
  const [scope, setScope] = useState<BatchSpecsScope>('all')
  const [groupSpecs, setGroupSpecs] = useState<GroupSpecState>(EMPTY_GROUP_SPECS)

  const updateGroupSpec = (id: BatchGroup['id'], patch: Partial<GearSpec>) => {
    setGroupSpecs((prev) => {
      const current = prev[id]
      const next: GearSpec = { ...current, ...patch }
      if (next.tier == null) delete next.tier
      if (next.enchant == null) delete next.enchant
      return { ...prev, [id]: next }
    })
  }

  const expandedSpecs: Partial<Record<SlotKey, GearSpec>> = {}
  for (const group of BATCH_GROUPS) {
    const g = groupSpecs[group.id]
    const hasTier = group.includeTier && g.tier != null
    const hasEnchant = g.enchant != null
    if (!hasTier && !hasEnchant) continue
    const entry: GearSpec = {}
    if (hasTier) entry.tier = g.tier
    if (hasEnchant) entry.enchant = g.enchant
    for (const key of group.keys) expandedSpecs[key] = entry
  }

  const hasAnySpec = Object.keys(expandedSpecs).length > 0
  const targetCount =
    scope === 'all' ? slots.length : slots.filter((s) => s.role_name === scope).length

  const apply = () => {
    if (!hasAnySpec || targetCount === 0) return
    onApply(scope, expandedSpecs)
    onClose()
  }

  const tiers: number[] = []
  for (let tier = GEAR_TIER_MIN; tier <= GEAR_TIER_MAX; tier++) tiers.push(tier)
  const enchants: number[] = []
  for (let e = GEAR_ENCHANT_MIN; e <= GEAR_ENCHANT_MAX; e++) enchants.push(e)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h3 className="font-bold text-white text-base">{t('batchSpecTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white"
            aria-label={tCommon('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          <p className="text-gray-400 text-xs leading-relaxed">{t('batchSpecHint')}</p>

          <div>
            <label className="text-gray-400 text-[11px] font-semibold block mb-1">
              {t('batchSpecScope')}
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as BatchSpecsScope)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">{t('batchSpecScopeAll')}</option>
              {SLOT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <p className="text-gray-500 text-[11px] mt-1">
              {t('batchSpecTargetCount', { count: targetCount })}
            </p>
          </div>

          <div className="space-y-2">
            {BATCH_GROUPS.map((group) => {
              const g = groupSpecs[group.id]
              const enchantColor =
                g.enchant != null
                  ? GEAR_ENCHANT_COLOR_CLASS[g.enchant] ?? 'text-white'
                  : 'text-white'
              return (
                <div key={group.id} className="flex items-center gap-2">
                  <span className="text-amber-400 text-[11px] font-semibold w-16 flex-shrink-0">
                    {t(group.labelKey)}
                  </span>
                  {group.includeTier ? (
                    <select
                      value={g.tier ?? ''}
                      onChange={(e) =>
                        updateGroupSpec(group.id, { tier: e.target.value ? Number(e.target.value) : undefined })
                      }
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                      aria-label={`${t(group.labelKey)} ${t('specTier')}`}
                    >
                      <option value="">{t('specTierAny')}</option>
                      {tiers.map((tier) => (
                        <option key={tier} value={tier}>
                          T{tier}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-600 text-[11px] italic w-[68px] flex-shrink-0">
                      {t('batchSpecTierFixed')}
                    </span>
                  )}
                  <select
                    value={g.enchant ?? ''}
                    onChange={(e) =>
                      updateGroupSpec(group.id, {
                        enchant: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className={`bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-amber-500 ${enchantColor}`}
                    aria-label={`${t(group.labelKey)} ${t('specEnchant')}`}
                  >
                    <option value="">{t('specEnchantAny')}</option>
                    {enchants.map((level) => (
                      <option key={level} value={level}>
                        @{level}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          <p className="text-gray-500 text-[11px] leading-relaxed">{t('batchSpecFillHint')}</p>
        </div>

        <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm px-4 py-2"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!hasAnySpec || targetCount === 0}
            className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-6 py-2 rounded-lg text-sm"
          >
            {t('batchSpecApply')}
          </button>
        </div>
      </div>
    </div>
  )
}
