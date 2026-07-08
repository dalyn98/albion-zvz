'use client'

// Migration 139: 무기 픽이 의존하는 종류 (방어구/신발/...) 후보를 좁히는 룰을
// 편집한다. weapon 자체는 의존성 시작점이라 대상에서 제외. 무기 옵션이 2개 이상
// + 의존 종류에 multi 옵션이 있을 때만 의미 있는 화면이라 그렇지 않으면 자체적
// 으로 noop. 매핑이 없으면 베이스 *_options 가 그대로 후보 (RPC 폴백과 동일).

import { useLocale, useTranslations } from 'next-intl'
import { getLocalizedItemName } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import ItemImage from '../ItemImage'
import type {
  ConditionalSlotOptions,
  DependentSlotKey,
  GearOption,
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

  const dependentKinds = getConditionalDependentKinds(dependentOptions)

  if (weaponOptions.length < 2 || dependentKinds.length === 0) return null

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
    if (!current) return true
    return current.some((o) => o.id === opt.id)
  }

  return (
    <details className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 space-y-2">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-amber-400 text-[12px] font-semibold">
        <span>{t('conditionalOptions.sectionTitle')}</span>
        <span className="text-gray-500 text-[10px] font-normal">
          {t('conditionalOptions.sectionHint')}
        </span>
      </summary>
      <div className="pt-2 space-y-3">
        {dependentKinds.map((kind) => (
          <div key={kind} className="rounded-lg border border-gray-800 bg-gray-900/40 p-2 space-y-2">
            <div className="text-[11px] font-semibold text-amber-300/90">
              {t('conditionalOptions.kindLabel', { kind: tGear(kind) })}
            </div>
            <div className="space-y-2">
              {weaponOptions.map((weapon) => {
                const narrowed = isUsing(kind, weapon.id)
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
                      {narrowed ? (
                        <button
                          type="button"
                          onClick={() => resetMapping(kind, weapon.id)}
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:text-white border border-gray-700"
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
                      {dependentOptions[kind].map((opt) => {
                        const enabled = isOptionEnabled(kind, weapon.id, opt)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleOption(kind, weapon.id, opt)}
                            className={`flex items-center gap-1 px-1.5 py-1 rounded border text-[10px] transition-colors ${
                              enabled
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                : 'bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300'
                            }`}
                            title={enabled
                              ? t('conditionalOptions.includedHint')
                              : t('conditionalOptions.excludedHint')}
                          >
                            <ItemImage itemId={opt.id} itemName={opt.name} size={20} />
                            <span className="truncate max-w-[8rem]">
                              {getLocalizedItemName(opt.id, locale, opt.name)}
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
