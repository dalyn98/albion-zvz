'use client'

// Migration 139: 무기 픽이 의존하는 종류 (방어구/신발/...) 후보를 좁히는 룰을
// 편집한다. 관리자가 빌드를 실제로 생각하는 순서와 같도록 무기별 카드 안에
// 머리/갑옷/신발 등의 허용 후보를 묶는다. weapon 자체는 의존성 시작점이라
// 대상에서 제외. 매핑이 없으면 베이스 *_options 가 그대로 후보 (RPC 폴백과 동일).

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
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
      <div className="flex min-h-10 items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-amber-300 text-balance">
          {t('conditionalOptions.sectionTitle')}
        </h3>
        <span className="rounded-full bg-gray-800 px-2 py-1 text-[10px] font-semibold text-gray-400 tabular-nums">
          {t('conditionalOptions.rulesCount', { count: configuredRuleCount })}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-400 text-pretty">
        {t('conditionalOptions.sectionHint')}
      </p>
      <div className="mt-4 space-y-3">
        {weaponOptions.map((weapon) => (
          <div
            key={weapon.id}
            className="rounded-xl border border-gray-700/80 bg-gray-950/55 p-3 shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
          >
            <div className="mb-3 flex items-center gap-2">
              <ItemImage itemId={weapon.id} itemName={weapon.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {getLocalizedItemName(weapon.id, locale, weapon.name)}
                </p>
                <p className="truncate font-mono text-[10px] text-gray-500">
                  {weapon.id}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {dependentKinds.map((kind) => {
                const narrowed = isUsing(kind, weapon.id)
                const kindOptions = optionsForKind(kind)
                const enabledCount = kindOptions.filter((option) => (
                  isOptionEnabled(kind, weapon.id, option)
                )).length
                return (
                  <div
                    key={kind}
                    className="rounded-lg bg-gray-900/70 p-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                  >
                    <div className="mb-2 flex min-h-10 items-center gap-2">
                      <p className="min-w-0 flex-1 text-xs font-semibold text-amber-200/90">
                        {t('conditionalOptions.kindLabel', { kind: tGear(kind) })}
                      </p>
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
                          className="min-h-10 rounded-lg border border-gray-700 bg-gray-800 px-2 text-[10px] font-semibold text-gray-300 transition-[background-color,color,scale] duration-150 hover:text-white active:scale-[0.96]"
                        >
                          {t('conditionalOptions.resetButton')}
                        </button>
                      ) : (
                        <span className="text-[10px] font-medium text-emerald-300/80">
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
                            className={`flex min-h-10 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] transition-[background-color,border-color,color,scale] duration-150 active:scale-[0.96] ${
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
    </section>
  )
}
