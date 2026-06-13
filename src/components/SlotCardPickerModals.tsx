'use client'

// SlotCard 의 신청 단계 모달 둘. SlotCard 본체에서 분리:
// - GearChoiceModal: 어드민이 마련해 둔 옵션 셋 중에서만 고르는 경우 (대부분의 슬롯).
// - SoloBombGearModal: 솔로밤 슬롯 — 멤버가 ItemPicker 로 빌드 9개 부위를
//   자유 입력 (마이그 134). 주무기 1개만 필수, 나머지는 선택.

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { X, Bomb, CheckCircle } from 'lucide-react'
import type { SlotPicks } from '@/app/actions/member'
import type { Slot, SlotKey } from '@/types'
import {
  SLOT_KEYS,
  SLOT_PICKER_CATEGORY,
  getEffectiveGearOptions,
  getGearOptions,
  isT8OnlySlot,
} from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
import { getLocalizedItemName } from '@/lib/item-names'
import {
  buildSlotSignupGearSummary,
  buildSlotSignupSpellSummary,
  type SlotSignupGearSummaryLine,
  type SlotSignupSpellSummaryLine,
} from '@/lib/slot-signup-confirmation'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import type { Locale } from '@/i18n/locales'
import ItemImage from './ItemImage'
import ItemPicker from './ItemPicker'
import SpellImage from './SpellImage'

export function GearChoiceModal({
  slot,
  kinds,
  onCancel,
  onConfirm,
}: {
  slot: Slot
  kinds: SlotKey[]
  onCancel: () => void
  onConfirm: (picks: SlotPicks) => void
}) {
  const [picks, setPicks] = useState<Record<string, string>>({})
  const t = useTranslations('slot.picker')
  const tGear = useTranslations('gear')
  const locale = useLocale() as Locale

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  // 무기 픽이 다른 종류 후보를 좁힐 수 있다 (Migration 139). 무기가 바뀔 때마다
  // 의존하는 종류의 effective 옵션을 다시 계산하고, 더 이상 후보에 없는 픽은
  // 자동으로 비운다 — 사용자가 무기를 바꾸면 옛 방어구 픽이 묵묵히 남아
  // 잘못 제출되는 걸 막기 위해서.
  const weaponPickId = picks.weapon ?? null
  useEffect(() => {
    // 무기 변경 → 의존하는 부위 (방어구 등) 픽이 더 이상 유효하지 않으면 제거.
    // 외부 (weapon pick) 변화 → 파생 state 정합 동기화. 도메인 invariant 자동화.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicks((prev) => {
      let changed = false
      const next: Record<string, string> = { ...prev }
      for (const k of kinds) {
        if (k === 'weapon') continue
        const chosenId = next[k]
        if (!chosenId) continue
        const effective = getEffectiveGearOptions(slot, k, weaponPickId) ?? []
        if (!effective.some((o) => o.id === chosenId)) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [weaponPickId, kinds, slot])

  const allSelected = kinds.every((k) => picks[k])

  const buildPicksPayload = (): SlotPicks => {
    const payload: SlotPicks = {}
    for (const k of kinds) {
      const chosenId = picks[k]
      if (!chosenId) continue
      const opt = getEffectiveGearOptions(slot, k, weaponPickId)?.find((o) => o.id === chosenId)
        ?? getGearOptions(slot, k)?.find((o) => o.id === chosenId)
      if (opt) payload[k] = { name: opt.name, id: opt.id }
    }
    return payload
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h3 className="font-bold text-white text-base">{t('title')}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-white"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
          {kinds.map((kind) => {
            const options = getEffectiveGearOptions(slot, kind, weaponPickId) ?? []
            const selectedId = picks[kind]
            // 베이스 옵션과 effective 옵션이 다르면 conditional 룰이 작동 중 —
            // 사용자에게 "무기 픽 때문에 후보가 좁혀졌다" 는 신호를 준다.
            const baseOptions = getGearOptions(slot, kind) ?? []
            const isNarrowed =
              kind !== 'weapon' &&
              !!weaponPickId &&
              options.length !== baseOptions.length
            const needsWeaponFirst =
              kind !== 'weapon' &&
              !weaponPickId &&
              !!slot.conditional_options?.[kind as Exclude<SlotKey, 'weapon'>]
            return (
              <section key={kind} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-amber-400 text-sm font-semibold">
                    {tGear(kind)}
                  </h4>
                  {isNarrowed && (
                    <span className="text-[10px] text-amber-300/70 font-medium">
                      {t('narrowedByWeapon')}
                    </span>
                  )}
                  {needsWeaponFirst && (
                    <span className="text-[10px] text-gray-400 font-medium">
                      {t('pickWeaponFirst')}
                    </span>
                  )}
                </div>
                {options.length === 0 ? (
                  <p className="text-rose-300 text-[12px] py-2 px-2 bg-rose-500/5 border border-rose-500/30 rounded-lg">
                    {t('noOptionsForWeapon')}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {options.map((opt) => {
                      const isSel = opt.id === selectedId
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setPicks((prev) => ({ ...prev, [kind]: opt.id }))}
                          className={`w-full flex items-center gap-2 rounded-lg p-2 border transition-colors text-left ${
                            isSel
                              ? 'bg-amber-500/10 border-amber-500/50'
                              : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <ItemImage itemId={opt.id} itemName={stripTierPrefix(opt.name)} size={35} />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {stripTierPrefix(getLocalizedItemName(opt.id, locale, opt.name) ?? opt.name)}
                            </p>
                            <p className="text-gray-500 text-[12px] font-mono truncate">{opt.id}</p>
                          </div>
                          {isSel && (
                            <span className="text-amber-400 text-[12px] font-bold flex-shrink-0">{t('selected')}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
        <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-white text-sm font-medium px-3 py-2"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!allSelected) return
              onConfirm(buildPicksPayload())
            }}
            disabled={!allSelected}
            className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold px-6 py-2 rounded-lg text-sm transition-colors"
          >
            {t('reviewSubmit')}
          </button>
        </div>
      </div>
    </div>
  )
}

// 솔로밤 슬롯 신청 모달. 멤버가 ItemPicker 로 9개 슬롯 카테고리 빌드를 직접
// 만든다. 주무기 1개만 필수 (위치/콤보를 결정하는 핵심), 나머지는 선택 — 빈
// 슬롯은 신청 페이로드에서 자동 누락되어 RPC 가 그대로 통과시킨다.
export function SoloBombGearModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: (picks: SlotPicks) => void
}) {
  const t = useTranslations('slot.picker')
  const tSolo = useTranslations('slot.soloBomb')
  const tGear = useTranslations('gear')
  const [picks, setPicks] = useState<Record<SlotKey, { name: string; id: string }>>(
    () =>
      SLOT_KEYS.reduce(
        (acc, k) => ({ ...acc, [k]: { name: '', id: '' } }),
        {} as Record<SlotKey, { name: string; id: string }>,
      ),
  )

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  const updateKind = (kind: SlotKey, name: string, id: string) =>
    setPicks((prev) => ({ ...prev, [kind]: { name, id } }))

  const clearKind = (kind: SlotKey) =>
    setPicks((prev) => ({ ...prev, [kind]: { name: '', id: '' } }))

  // 주무기는 솔로밤 빌드의 정체성 (Mage / DPS / Battle Mount 결정), 최소 한 개는
  // 채워야 신청을 받는다. 나머지는 선택 — 캡/마운트/포션은 본인이 알아서.
  const weapon = picks.weapon
  const canSubmit = !!weapon.name

  const buildPicksPayload = (): SlotPicks => {
    const payload: SlotPicks = {}
    for (const k of SLOT_KEYS) {
      const { name, id } = picks[k]
      if (!name) continue
      payload[k] = { name, id }
    }
    return payload
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 border border-rose-500/40 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Bomb size={14} className="text-rose-400 flex-shrink-0" />
            <h3 className="font-bold text-white text-base">{tSolo('modalTitle')}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-white"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-shrink-0 px-4 py-2 text-[11px] text-gray-400 leading-snug border-b border-gray-800 bg-gray-950/40">
          {tSolo('modalHint')}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {SLOT_KEYS.map((kind) => (
            <ItemPicker
              key={kind}
              label={tGear(kind)}
              category={SLOT_PICKER_CATEGORY[kind]}
              tier={isT8OnlySlot(kind) ? 8 : undefined}
              itemName={picks[kind].name || null}
              itemId={picks[kind].id || null}
              onChange={(name, id) => updateKind(kind, name, id)}
              onClear={() => clearKind(kind)}
            />
          ))}
        </div>
        <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2 items-center">
          {!canSubmit && (
            <span className="text-rose-300 text-[11px] flex-1">
              {tSolo('weaponRequired')}
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-white text-sm font-medium px-3 py-2"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canSubmit) return
              onConfirm(buildPicksPayload())
            }}
            disabled={!canSubmit}
            className="ml-auto bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white font-bold px-6 py-2 rounded-lg text-sm transition-colors"
          >
            {tSolo('reviewSubmit')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function SlotApplyConfirmModal({
  slot,
  slotLabel,
  picks,
  tone,
  pending,
  onCancel,
  onConfirm,
}: {
  slot: Slot
  slotLabel: string
  picks: SlotPicks
  tone: 'amber' | 'rose'
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useTranslations('slot.confirm')
  const tGear = useTranslations('gear')
  const tRole = useTranslations('slotRole')
  const locale = useLocale() as Locale
  const gearRows = buildSlotSignupGearSummary(slot, picks)
  const spellRows = buildSlotSignupSpellSummary(slot, picks)
  const isRose = tone === 'rose'

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
      if (e.key === 'Enter' && !pending) onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onCancel, onConfirm, pending])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={() => {
        if (!pending) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-apply-confirm-title"
        className={`bg-gray-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[92dvh] border ${
          isRose ? 'border-rose-500/40' : 'border-amber-500/40'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle
              size={16}
              className={`flex-shrink-0 ${isRose ? 'text-rose-300' : 'text-amber-300'}`}
            />
            <h3 id="slot-apply-confirm-title" className="font-bold text-white text-base">
              {t('title')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-40"
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 space-y-2">
            <ConfirmRow label={t('slotLabel')} value={slotLabel} />
            <ConfirmRow
              label={t('roleLabel')}
              value={slot.role_name ? translateSlotRole(slot.role_name, tRole) : '-'}
            />
            <ConfirmRow
              label={t('memoLabel')}
              value={slot.notes?.trim() || t('memoEmpty')}
              multiline
            />
          </div>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-200">{t('gearLabel')}</h4>
            {gearRows.length === 0 ? (
              <p className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-sm text-gray-500">
                {t('gearEmpty')}
              </p>
            ) : (
              <div className="space-y-1.5">
                {gearRows.map((row) => (
                  <div
                    key={row.kind}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2"
                  >
                    <span className="text-xs font-semibold text-gray-400 flex-shrink-0">
                      {tGear(row.kind)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right text-sm text-white">
                      {formatGearName(row, locale)}
                    </span>
                    {row.selected && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                        isRose ? 'bg-rose-500/15 text-rose-200' : 'bg-amber-500/15 text-amber-200'
                      }`}>
                        {t('selectedBadge')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-200">{t('spellLabel')}</h4>
            {spellRows.length === 0 ? (
              <p className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-sm text-gray-500">
                {t('spellEmpty')}
              </p>
            ) : (
              <div className="space-y-1.5">
                {spellRows.map((row) => (
                  <div
                    key={`${row.kind}:${row.gearId ?? row.gearName ?? 'gear'}`}
                    className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-400 flex-shrink-0">
                        {tGear(row.kind)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right text-sm text-white">
                        {formatSpellGearName(row, locale)}
                      </span>
                      {row.selected && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          isRose ? 'bg-rose-500/15 text-rose-200' : 'bg-amber-500/15 text-amber-200'
                        }`}>
                          {t('selectedBadge')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {row.spellIds.map((spellId) => (
                        <span
                          key={spellId}
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1.5"
                          title={spellId}
                        >
                          <SpellImage spellId={spellId} size={32} />
                          <span className="max-w-[160px] truncate font-mono text-[10px] text-gray-300">
                            {spellId}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-[12px] text-gray-400 leading-snug">{t('hint')}</p>
        </div>

        <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-gray-400 hover:text-white text-sm font-medium px-3 py-2 disabled:opacity-40"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            autoFocus
            className={`ml-auto font-bold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
              isRose
                ? 'bg-rose-500 hover:bg-rose-400 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-black'
            }`}
          >
            {pending ? t('submitting') : t('submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmRow({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className={`text-gray-100 min-w-0 ${multiline ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
        {value}
      </span>
    </div>
  )
}

function formatGearName(row: SlotSignupGearSummaryLine, locale: Locale): string {
  const localized = getLocalizedItemName(row.id, locale, row.name) ?? row.name
  return stripTierPrefix(localized)
}

function formatSpellGearName(row: SlotSignupSpellSummaryLine, locale: Locale): string {
  if (!row.gearName && !row.gearId) return '-'
  const localized =
    getLocalizedItemName(row.gearId, locale, row.gearName ?? undefined) ?? row.gearName ?? row.gearId
  return stripTierPrefix(localized)
}
