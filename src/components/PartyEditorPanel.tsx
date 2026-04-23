'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Eye, EyeOff, Package, Beaker, Bomb, Megaphone } from 'lucide-react'
import SlotEditor, { emptySlotInput, type SlotInput } from './SlotEditor'
import BatchApplySpecsModal, { type BatchSpecsScope } from './BatchApplySpecsModal'
import BatchApplyItemsModal from './BatchApplyItemsModal'
import FeatureSetupRequiredModal from './FeatureSetupRequiredModal'
import type { BombSquadKind, EventCategory, GearSpec, SlotKey } from '@/types'
import { BOMB_SQUAD_KINDS, SLOT_KEYS } from '@/types'
import { savePartySlots } from '@/app/actions/admin'
import type { PartyWithSlots } from '@/types'
import { slotToInput } from '@/lib/slot-to-input'
import { useRegisterSave } from './EventEditSaveRegistry'

interface MemberDirectoryEntry {
  discord_id: string
  username: string
  eligible: boolean
}

interface Props {
  eventId: string
  partyNumber: number
  initialData: PartyWithSlots | null
  memberDirectory: MemberDirectoryEntry[]
  // 전역 auto_regear_enabled — SlotEditor 에 그대로 내려 "자동 리기어 제외"
  // 체크박스 가시성을 제어.
  autoRegearEnabled: boolean
  // 편집 중인 이벤트의 카테고리. SlotEditor 에 내려 슬롯 템플릿 저장/불러오기
  // 다이얼로그가 이벤트 카테고리를 기본값으로 쓰게 한다.
  eventCategory?: EventCategory
  // 콜러 전용 모드: 파티 메타(밤스쿼드 토글/이름/콜러) 설정 섹션을 숨기고
  // 슬롯 편집 UI 만 노출. 저장 시 partyMeta 는 서버에서도 방어적으로 무시
  // 되지만, 우선 UI 수준에서 차단해 혼란 방지.
  isCallerScoped?: boolean
  // 펼친 상태로 시작 — 콜러 전용 페이지에서는 첫 진입 시 편집 화면이 바로
  // 보이게 하고 싶고, 관리자 편집기에서는 기존 접혀있는 기본값을 유지.
  defaultOpen?: boolean
}

export default function PartyEditorPanel({
  eventId,
  partyNumber,
  initialData,
  memberDirectory,
  autoRegearEnabled,
  eventCategory,
  isCallerScoped = false,
  defaultOpen = false,
}: Props) {
  const t = useTranslations('adminParty')
  const [slots, setSlots] = useState<SlotInput[]>(
    initialData?.slots.map(slotToInput) ?? []
  )
  const [isBombSquad, setIsBombSquad] = useState<boolean>(
    initialData?.is_bomb_squad ?? false,
  )
  const [bombSquadKind, setBombSquadKind] = useState<BombSquadKind>(
    initialData?.bomb_squad_kind ?? 'melee',
  )
  const [partyName, setPartyName] = useState<string>(initialData?.name ?? '')
  const [callerDiscordId, setCallerDiscordId] = useState<string>(
    initialData?.caller_discord_id ?? '',
  )
  const [error, setError] = useState('')
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchItemsModalOpen, setBatchItemsModalOpen] = useState(false)
  // 콜러 후보가 한 명도 없는 상태에서 밤스쿼드 토글을 켜려 하면 띄우는 안내 모달.
  const [callerSetupModalOpen, setCallerSetupModalOpen] = useState(false)

  const hasEligibleCaller = memberDirectory.some((m) => m.eligible)
  const handleBombSquadToggle = (checked: boolean) => {
    if (checked && !hasEligibleCaller) {
      setCallerSetupModalOpen(true)
      return
    }
    setIsBombSquad(checked)
  }
  // <details> 의 open 을 prop 값으로 직접 제어하면 (open={false}) React 가 매
  // 리렌더마다 DOM 의 open 속성을 강제 제거해, 사용자가 열어 둔 패널이 다른
  // state 변경(dropdown/체크박스)으로 리렌더될 때마다 닫혀버린다. isOpen
  // state 로 한 번 래핑해 onToggle 에서 사용자 인터랙션을 받아 React 상태와
  // DOM 을 동기화.
  const [isOpen, setIsOpen] = useState(defaultOpen)

  // Overwrite semantics: potion/mount are uniform within a party in practice,
  // so a bulk apply that skips already-set slots would leave accidental holes.
  // Slots configured with option (multi) lists are left untouched — their
  // fixed columns are null by convention and we'd corrupt that shape.
  const applyBatchItems = (picks: {
    potion: { name: string; id: string } | null
    mount: { name: string; id: string } | null
  }) => {
    setSlots((prev) =>
      prev.map((s) => {
        const nextItems = { ...s.items }
        let changed = false
        if (picks.potion && s.options.potion.length === 0) {
          nextItems.potion = { name: picks.potion.name, id: picks.potion.id }
          changed = true
        }
        if (picks.mount && s.options.mount.length === 0) {
          nextItems.mount = { name: picks.mount.name, id: picks.mount.id }
          changed = true
        }
        return changed ? { ...s, items: nextItems } : s
      }),
    )
  }

  const applyBatchSpecs = (
    scope: BatchSpecsScope,
    incoming: Partial<Record<SlotKey, GearSpec>>,
  ) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (scope !== 'all' && s.role_name !== scope) return s
        const nextSpecs = { ...s.specs }
        let changed = false
        for (const key of SLOT_KEYS) {
          const patch = incoming[key]
          if (!patch) continue
          const current = nextSpecs[key] ?? {}
          const merged: GearSpec = { ...current }
          // Fill-empty-only semantics: never override an admin's manual spec.
          if (patch.tier != null && merged.tier == null) {
            merged.tier = patch.tier
            changed = true
          }
          if (patch.enchant != null && merged.enchant == null) {
            merged.enchant = patch.enchant
            changed = true
          }
          nextSpecs[key] = merged
        }
        return changed ? { ...s, specs: nextSpecs } : s
      }),
    )
  }

  const addSlot = () => {
    if (slots.length >= 20) return
    const nextNum = slots.length > 0 ? Math.max(...slots.map((s) => s.slot_number)) + 1 : 1
    setSlots([...slots, emptySlotInput(nextNum)])
  }

  const updateSlot = (idx: number, updated: SlotInput) =>
    setSlots(slots.map((s, i) => i === idx ? updated : s))

  const deleteSlot = (idx: number) =>
    setSlots(slots.filter((_, i) => i !== idx))

  const moveSlot = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= slots.length) return
    const next = [...slots]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setSlots(next)
  }

  const toggleHide = (idx: number) =>
    setSlots(slots.map((s, i) => i === idx ? { ...s, is_hidden: !s.is_hidden } : s))

  // 파티 안의 모든 슬롯을 한 번에 숨김/보이기. 하나라도 보이면 전체 숨김,
  // 전부 숨겨진 상태면 전체 공개. 공개 페이지에선 이미 is_hidden 슬롯이
  // fetch 단계에서 걸러지므로 이 토글만으로 파티 카드 자체가 사라지는 효과.
  const anyVisibleSlot = slots.some((s) => !s.is_hidden)
  const toggleAllHidden = () => {
    if (slots.length === 0) return
    setSlots(slots.map((s) => ({ ...s, is_hidden: anyVisibleSlot })))
  }

  // 상위 저장 바에서 호출될 saver. 개별 저장 버튼이 없어졌으므로 에러만
  // 지역 state 에 반영하고 실제 router.refresh 는 저장 바가 처리.
  const persistParty = async (): Promise<{ error?: string }> => {
    const result = await savePartySlots(
      eventId,
      partyNumber,
      initialData?.id ?? null,
      slots.map((s, i) => ({ ...s, slot_number: i + 1 })),
      (initialData?.slots ?? []).map((s) => s.id),
      {
        is_bomb_squad: isBombSquad,
        bomb_squad_kind: isBombSquad ? bombSquadKind : null,
        name: isBombSquad ? partyName.trim() : null,
        caller_discord_id: isBombSquad ? callerDiscordId.trim() || null : null,
      },
    )
    if (result.error) {
      setError(result.error)
      return { error: result.error }
    }
    setError('')
    return {}
  }

  useRegisterSave(`party-${partyNumber}`, t('partyBadge', { num: partyNumber }), persistParty)

  const callerName =
    isBombSquad && callerDiscordId
      ? memberDirectory.find((m) => m.discord_id === callerDiscordId)?.username ?? null
      : null

  return (
    <details
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
      className="group border border-gray-700 rounded-xl overflow-hidden"
    >
      <summary className="flex items-center justify-between px-4 py-3 bg-gray-900 cursor-pointer hover:bg-gray-800 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <span className={`${isBombSquad ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-400'} text-sm font-bold px-2.5 py-0.5 rounded flex items-center gap-1`}>
            {isBombSquad && <Bomb size={12} />}
            {isBombSquad && partyName.trim()
              ? partyName.trim()
              : t('partyBadge', { num: partyNumber })}
          </span>
          {isBombSquad && (
            <span className="bg-rose-500/10 text-rose-300 text-xs font-semibold px-2 py-0.5 rounded border border-rose-500/30">
              {t(`bombSquad.kind.${bombSquadKind}`)}
            </span>
          )}
          {callerName && (
            <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-200 text-xs font-semibold px-2 py-0.5 rounded border border-rose-500/30">
              <Megaphone size={10} />
              {t('bombSquad.callerBadge', { name: callerName })}
            </span>
          )}
          <span className="text-gray-400 text-sm">
            {t('slotCount', { count: slots.length })}
          </span>
          <span className="text-green-400 text-xs">
            {t('appliedCount', { count: slots.filter((s) => s.assigned_username).length })}
          </span>
        </div>
        <ChevronDown size={16} className="text-gray-400 group-open:hidden" />
        <ChevronUp size={16} className="text-gray-400 hidden group-open:block" />
      </summary>

      <div className="p-4 space-y-3 border-t border-gray-700">
        {!isCallerScoped && (
        <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-200">
            <input
              type="checkbox"
              checked={isBombSquad}
              onChange={(e) => handleBombSquadToggle(e.target.checked)}
              className="h-4 w-4 accent-rose-500"
            />
            <Bomb size={14} className="text-rose-400" />
            <span className="font-semibold">{t('bombSquad.toggleLabel')}</span>
            <span className="text-gray-500 text-xs">{t('bombSquad.toggleHint')}</span>
          </label>
          {isBombSquad && (
            <div className="pl-6 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 min-w-[3rem]">{t('bombSquad.kindLabel')}</span>
                {BOMB_SQUAD_KINDS.map((kind) => (
                  <label key={kind} className="flex items-center gap-1.5 text-sm text-gray-200 cursor-pointer">
                    <input
                      type="radio"
                      name={`bomb-kind-${partyNumber}`}
                      value={kind}
                      checked={bombSquadKind === kind}
                      onChange={() => setBombSquadKind(kind)}
                      className="h-3.5 w-3.5 accent-rose-500"
                    />
                    {t(`bombSquad.kind.${kind}`)}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor={`bomb-name-${partyNumber}`}
                  className="text-xs text-gray-400 min-w-[3rem]"
                >
                  {t('bombSquad.nameLabel')}
                </label>
                <input
                  id={`bomb-name-${partyNumber}`}
                  type="text"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  placeholder={t('bombSquad.namePlaceholder')}
                  maxLength={40}
                  className="flex-1 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 placeholder-gray-500 focus:border-rose-500/60 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor={`bomb-caller-${partyNumber}`}
                  className="text-xs text-gray-400 min-w-[3rem]"
                >
                  {t('bombSquad.callerLabel')}
                </label>
                <select
                  id={`bomb-caller-${partyNumber}`}
                  value={callerDiscordId}
                  onChange={(e) => setCallerDiscordId(e.target.value)}
                  className="flex-1 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100 focus:border-rose-500/60 focus:outline-none"
                >
                  <option value="">{t('bombSquad.callerPlaceholder')}</option>
                  {memberDirectory.map((m) => (
                    <option key={m.discord_id} value={m.discord_id}>
                      {m.eligible ? m.username : t('bombSquad.callerStale', { name: m.username })}
                    </option>
                  ))}
                </select>
              </div>
              {memberDirectory.every((m) => !m.eligible) && (
                <p className="pl-[3rem] text-xs text-amber-400/80">
                  {t('bombSquad.callerEmptyHint')}
                </p>
              )}
            </div>
          )}
        </div>
        )}
        {slots.length > 0 && (
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={toggleAllHidden}
              className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg"
              title={anyVisibleSlot ? t('hideAllTitle') : t('showAllTitle')}
            >
              {anyVisibleSlot ? <EyeOff size={12} /> : <Eye size={12} />}
              {anyVisibleSlot ? t('hideAllButton') : t('showAllButton')}
            </button>
            <button
              type="button"
              onClick={() => setBatchItemsModalOpen(true)}
              className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-amber-300 px-3 py-1.5 rounded-lg"
            >
              <Beaker size={12} />
              {t('batchItemsButton')}
            </button>
            <button
              type="button"
              onClick={() => setBatchModalOpen(true)}
              className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-amber-300 px-3 py-1.5 rounded-lg"
            >
              <Package size={12} />
              {t('batchSpecButton')}
            </button>
          </div>
        )}

        {slots.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-4">
            {t('noSlotsHint')}
          </p>
        )}

        {slots.map((slot, idx) => (
          <div
            key={idx}
            className={slot.is_hidden ? 'opacity-60' : undefined}
          >
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveSlot(idx, -1)}
                  disabled={idx === 0}
                  aria-label={t('moveUp')}
                  title={t('moveUp')}
                  className="p-1 rounded text-gray-400 hover:text-amber-300 hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveSlot(idx, 1)}
                  disabled={idx === slots.length - 1}
                  aria-label={t('moveDown')}
                  title={t('moveDown')}
                  className="p-1 rounded text-gray-400 hover:text-amber-300 hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                >
                  <ArrowDown size={14} />
                </button>
                {slot.is_hidden && (
                  <span className="ml-1 bg-gray-700/60 text-gray-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {t('hiddenBadge')}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleHide(idx)}
                aria-label={slot.is_hidden ? t('show') : t('hide')}
                title={slot.is_hidden ? t('show') : t('hide')}
                className="flex items-center gap-1 p-1 rounded text-gray-400 hover:text-amber-300 hover:bg-gray-800 text-xs"
              >
                {slot.is_hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{slot.is_hidden ? t('show') : t('hide')}</span>
              </button>
            </div>
            <SlotEditor
              slot={slot}
              partyNumber={partyNumber}
              autoRegearEnabled={autoRegearEnabled}
              eventCategory={eventCategory}
              onChange={(updated) => updateSlot(idx, updated)}
              onDelete={() => deleteSlot(idx)}
            />
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={addSlot}
            disabled={slots.length >= 20}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 disabled:text-gray-600 text-sm font-medium"
          >
            <Plus size={14} /> {t('addSlot', { count: slots.length })}
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>

      {batchModalOpen && (
        <BatchApplySpecsModal
          slots={slots}
          onApply={applyBatchSpecs}
          onClose={() => setBatchModalOpen(false)}
        />
      )}

      {batchItemsModalOpen && (
        <BatchApplyItemsModal
          slots={slots}
          onApply={applyBatchItems}
          onClose={() => setBatchItemsModalOpen(false)}
        />
      )}

      {callerSetupModalOpen && (
        <FeatureSetupRequiredModal
          title={t('bombSquad.callerSetupTitle')}
          body={t('bombSquad.callerSetupBody')}
          settingsHref="/admin/dashboard/settings?tab=permissions"
          settingsLabel={t('bombSquad.callerSetupCta')}
          onClose={() => setCallerSetupModalOpen(false)}
        />
      )}
    </details>
  )
}
