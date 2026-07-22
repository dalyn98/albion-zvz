'use client'

// Migration 139: 무기 픽이 의존하는 종류 (방어구/신발/...) 후보를 좁히는 룰을
// 편집한다. weapon 자체는 의존성 시작점이라 대상에서 제외. 무기 옵션이 2개 이상
// + 의존 종류에 multi 옵션이 있을 때만 의미 있는 화면이라 그렇지 않으면 자체적
// 으로 noop. 매핑이 없으면 베이스 *_options 가 그대로 후보 (RPC 폴백과 동일).

import { useLocale, useTranslations } from 'next-intl'
import { useItemNameResolver } from '@/lib/item-names-client'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import ItemImage from '../ItemImage'
import type {
  ConditionalSlotOptions,
  DependentSlotKey,
  GearOption,
} from '@/types'
import {
  NO_OFFHAND_OPTION_ID,
  NO_OFFHAND_OPTION_NAME,
  isNoOffhandOption,
} from '@/types'
import type { SlotInput } from './slot-input'
import { getConditionalDependentKinds } from './conditional-options'

interface Props {
  weaponOptions: GearOption[]
  dependentOptions: SlotInput['options']
  conditional: ConditionalSlotOptions
  onChange: (next: ConditionalSlotOptions) => void
}

export function ConditionalOptionsSection({
  weaponOptions,
  dependentOptions,
  conditional,
  onChange,
}: Props) {
  const t = useTranslations('adminParty')
  const tGear = useTranslations('gear')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const { getLocalizedItemName } = useItemNameResolver(locale)

  const dependentKinds = getConditionalDependentKinds(dependentOptions)

  if (weaponOptions.length < 2 || dependentKinds.length === 0) return null

  const noneOffhandOption = { name: NO_OFFHAND_OPTION_NAME, id: NO_OFFHAND_OPTION_ID }
  const optionsForKind = (kind: DependentSlotKey): GearOption[] =>
    kind === 'offhand' ? [...dependentOptions[kind], noneOffhandOption] : dependentOptions[kind]

  const setMapping = (kind: DependentSlotKey, weaponId: string, opts: GearOption[] | null) => {
    const nextKindMap: Record<string, GearOption[]> = { ...(conditional[kind] ?? {}) }
    if (opts === null) {
      delete nextKindMap[weaponId]
    } else {
      nextKindMap[weaponId] = opts
    }
    const nextConditional: ConditionalSlotOptions = { ...conditional }
    if (Object.keys(nextKindMap).length === 0) {
      delete nextConditional[kind]
    } else {
      nextConditional[kind] = nextKindMap
    }
    onChange(nextConditional)
  }

  const toggleOption = (kind: DependentSlotKey, weaponId: string, opt: GearOption) => {
    const current = conditional[kind]?.[weaponId] ?? null
    if (current === null) {
      if (kind === 'offhand' && isNoOffhandOption(opt)) {
        setMapping(kind, weaponId, [noneOffhandOption])
        return
      }
      // First narrow: start by excluding the toggled option (assume "narrow"
      // semantically means "remove some"). All-but-this is more useful than
      // only-this when the admin is just trying to drop one bad combo.
      const allBut = dependentOptions[kind].filter((o) => o.id !== opt.id)
      setMapping(kind, weaponId, allBut)
      return
    }
    const exists = current.some((o) => o.id === opt.id)
    if (exists) {
      const next = current.filter((o) => o.id !== opt.id)
      // 후보 0 개로 떨어지면 검증 자체가 실패하므로 매핑 자체를 drop —
      // "베이스로 되돌리기" 와 같은 효과 + 0개 후보라는 갑갑한 상태를 막는다.
      if (next.length === 0) {
        setMapping(kind, weaponId, null)
      } else {
        setMapping(kind, weaponId, next)
      }
      return
    }
    setMapping(kind, weaponId, [...current, { name: opt.name, id: opt.id }])
  }

  const resetMapping = (kind: DependentSlotKey, weaponId: string) => {
    setMapping(kind, weaponId, null)
  }

  const isUsing = (kind: DependentSlotKey, weaponId: string) =>
    conditional[kind]?.[weaponId] != null

  const isOptionEnabled = (kind: DependentSlotKey, weaponId: string, opt: GearOption) => {
    const current = conditional[kind]?.[weaponId]
    if (!current) return !isNoOffhandOption(opt)
    return current.some((o) => o.id === opt.id)
  }

  const optionLabel = (opt: GearOption) =>
    isNoOffhandOption(opt)
      ? t('conditionalOptions.noOffhandOption')
      : getLocalizedItemName(opt.id, locale, opt.name)

  const configuredRuleCount = dependentKinds.reduce(
    (count, kind) => count + Object.keys(conditional[kind] ?? {}).length,
    0,
  )

  return (
    <details className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-[12px] font-semibold text-amber-400 [&::-webkit-details-marker]:hidden">
        <span>{t('conditionalOptions.sectionTitle')}</span>
        <span className="rounded-full bg-gray-800 px-2 py-1 text-[10px] font-semibold text-gray-400 tabular-nums">
          {t('conditionalOptions.rulesCount', { count: configuredRuleCount })}
        </span>
      </summary>
      <p className="mt-1 text-[10px] leading-relaxed text-gray-500 text-pretty">
        {t('conditionalOptions.sectionHint')}
      </p>
      <div className="pt-2 space-y-3">
        {dependentKinds.map((kind) => (
          <div key={kind} className="rounded-lg border border-gray-800 bg-gray-900/40 p-2 space-y-2">
            <div className="text-[11px] font-semibold text-amber-300/90">
              {t('conditionalOptions.kindLabel', { kind: tGear(kind) })}
            </div>
            <div className="space-y-2">
              {weaponOptions.map((weapon) => {
                const narrowed = isUsing(kind, weapon.id)
                const kindOptions = optionsForKind(kind)
                const enabledCount = kindOptions.filter((option) => (
                  isOptionEnabled(kind, weapon.id, option)
                )).length
                return (
                  <div
                    key={weapon.id}
                    className="rounded-md border border-gray-800 bg-gray-950/40 p-2"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <ItemImage itemId={weapon.id} itemName={weapon.name} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[12px] font-medium truncate">
                          {getLocalizedItemName(weapon.id, locale, weapon.name)}
                        </p>
                        <p className="text-gray-500 text-[10px] font-mono truncate">
                          {weapon.id}
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500 tabular-nums">
                        {t('conditionalOptions.candidateCount', {
                          selected: enabledCount,
                          total: kindOptions.length,
                        })}
                      </span>
                      {narrowed ? (
                        <button
                          type="button"
                          onClick={() => resetMapping(kind, weapon.id)}
                          className="min-h-10 rounded-lg border border-gray-700 bg-gray-800 px-2 text-[10px] font-semibold text-gray-300 transition-[background-color,scale] duration-150 hover:text-white active:scale-[0.96]"
                        >
                          {t('conditionalOptions.resetButton')}
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-300/80 font-medium">
                          {t('conditionalOptions.usingDefault')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {kindOptions.map((opt) => {
                        const enabled = isOptionEnabled(kind, weapon.id, opt)
                        const noOffhand = isNoOffhandOption(opt)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleOption(kind, weapon.id, opt)}
                            aria-pressed={enabled}
                            className={`flex min-h-10 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] transition-[background-color,color,scale] duration-150 active:scale-[0.96] ${
                              enabled
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                : 'bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300'
                            }`}
                            title={enabled
                              ? t('conditionalOptions.includedHint')
                              : t('conditionalOptions.excludedHint')}
                          >
                            {noOffhand ? (
                              <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-800 text-[9px] font-bold text-gray-300">
                                -
                              </span>
                            ) : (
                              <ItemImage itemId={opt.id} itemName={opt.name} size={20} />
                            )}
                            <span className="truncate max-w-[8rem]">
                              {optionLabel(opt)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
