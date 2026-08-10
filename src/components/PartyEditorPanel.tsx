'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bomb, ChevronDown, ChevronUp, Megaphone, RefreshCcw, X } from 'lucide-react'
import type { SlotInput } from './SlotEditor'
import PartySlotWorkspace from './PartySlotWorkspace'
import FeatureSetupRequiredModal from './FeatureSetupRequiredModal'
import type { BombSquadKind, EventCategory } from '@/types'
import { BOMB_SQUAD_KINDS } from '@/types'
import { savePartySlots } from '@/app/actions/admin'
import type { PartyWithSlots } from '@/types'
import { slotToInput } from '@/lib/slot-to-input'
import { useRegisterSave, useReportDirty } from './EventEditSaveRegistry'
import { useReportEventPartyDraft } from './EventRosterDraftProvider'

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
  timezone: string
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
  timezone,
  isCallerScoped = false,
  defaultOpen = false,
}: Props) {
  const t = useTranslations('adminParty')
  const [slots, setSlots] = useState<SlotInput[]>(
    initialData?.slots.map(slotToInput) ?? []
  )
  const [savedPartyId, setSavedPartyId] = useState<string | null>(initialData?.id ?? null)
  const [slotsVersion, setSlotsVersion] = useState<number>(initialData?.slots_version ?? 0)
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
  const [staleConflict, setStaleConflict] = useState(false)
  // 콜러 후보가 한 명도 없는 상태에서 밤스쿼드 토글을 켜려 하면 띄우는 안내 모달.
  const [callerSetupModalOpen, setCallerSetupModalOpen] = useState(false)

  const hasEligibleCaller = memberDirectory.some((m) => m.eligible)
  const handleBombSquadToggle = (checked: boolean) => {
    if (checked && !hasEligibleCaller) {
      setCallerSetupModalOpen(true)
      return
    }
    setIsBombSquad(checked)
    // 밤스쿼드 OFF 로 전환하면 솔로밤 슬롯도 함께 해제 — DB 트리거가
    // is_solo_bomb=true 인 슬롯에 대해 party.is_bomb_squad=true 를 강제하므로
    // 미해제 상태로 저장하면 SOLO_BOMB_REQUIRES_BOMB_SQUAD_PARTY 로 실패.
    if (!checked) {
      setSlots((prev) => prev.map((s) => (s.is_solo_bomb ? { ...s, is_solo_bomb: false } : s)))
    }
  }
  // <details> 의 open 을 prop 값으로 직접 제어하면 (open={false}) React 가 매
  // 리렌더마다 DOM 의 open 속성을 강제 제거해, 사용자가 열어 둔 패널이 다른
  // state 변경(dropdown/체크박스)으로 리렌더될 때마다 닫혀버린다. isOpen
  // state 로 한 번 래핑해 onToggle 에서 사용자 인터랙션을 받아 React 상태와
  // DOM 을 동기화.
  const [isOpen, setIsOpen] = useState(defaultOpen)

  // 미저장 변경 추적: 마운트 시점 (또는 마지막 저장 직후) 의 입력을 직렬화해
  // 보관하고 현재 입력과 문자열 비교. slots/specs 가 깊은 객체라서 깊은 비교
  // 보다 JSON.stringify 한 줄이 일관성 + 디버그 용이성에서 우월하다.
  const computeSnapshot = (snapshotSlots: SlotInput[] = slots) =>
    JSON.stringify({
      slots: snapshotSlots,
      isBombSquad,
      bombSquadKind: isBombSquad ? bombSquadKind : null,
      partyName: isBombSquad ? partyName.trim() : '',
      callerDiscordId: isBombSquad ? callerDiscordId.trim() : '',
    })
  const [cleanSnapshot, setCleanSnapshot] = useState<string>(() => computeSnapshot())
  const currentSnapshot = useMemo(
    () => computeSnapshot(),
    // computeSnapshot 은 closure 로 모든 입력을 읽으므로 의존성에 입력을 나열.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, isBombSquad, bombSquadKind, partyName, callerDiscordId],
  )
  const isDirty = currentSnapshot !== cleanSnapshot
  useReportDirty(`party-${partyNumber}`, isDirty)
  const liveDraft = useMemo(() => ({
    partyNumber,
    slots,
    name: partyName,
    isBombSquad,
    bombSquadKind,
    callerDiscordId,
  }), [bombSquadKind, callerDiscordId, isBombSquad, partyName, partyNumber, slots])
  useReportEventPartyDraft(liveDraft)

  // 상위 저장 바에서 호출될 saver. 개별 저장 버튼이 없어졌으므로 에러만
  // 지역 state 에 반영하고 실제 router.refresh 는 저장 바가 처리.
  const persistParty = async (): Promise<{ error?: string }> => {
    // Legacy/id-less local state can survive a fast save before router.refresh.
    // Assign identities before the request so retries address the same rows.
    const slotsAtSave = slots.map((slot) => ({
      ...slot,
      id: slot.id || crypto.randomUUID(),
    }))
    if (slotsAtSave.some((slot, index) => slot.id !== slots[index]?.id)) {
      setSlots(slotsAtSave)
    }
    const snapshotAtSave = computeSnapshot(slotsAtSave)
    const result = await savePartySlots(
      eventId,
      partyNumber,
      savedPartyId,
      slotsAtSave.map((s, i) => ({ ...s, slot_number: i + 1 })),
      slotsVersion,
      {
        is_bomb_squad: isBombSquad,
        bomb_squad_kind: isBombSquad ? bombSquadKind : null,
        name: isBombSquad ? partyName.trim() : null,
        caller_discord_id: isBombSquad ? callerDiscordId.trim() || null : null,
      },
    )
    if (result.error) {
      setError(result.error)
      setStaleConflict(result.stale === true)
      setIsOpen(true)
      return { error: result.error }
    }
    setError('')
    setStaleConflict(false)
    if (result.partyId) setSavedPartyId(result.partyId)
    if (result.slotsVersion != null) setSlotsVersion(result.slotsVersion)
    // 저장 성공 — 현재 입력을 새 "clean" 기준으로 채택. 다시 변경하면 다시 dirty.
    setCleanSnapshot(snapshotAtSave)
    return {}
  }

  useRegisterSave(`party-${partyNumber}`, t('partyBadge', { num: partyNumber }), persistParty)

  const callerName =
    isBombSquad && callerDiscordId
      ? memberDirectory.find((m) => m.discord_id === callerDiscordId)?.username ?? null
      : null
  return (
    <details
      id={`event-save-party-${partyNumber}`}
      name={`event-party-editor-${eventId}`}
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
      data-party-editor-panel
      className="group overflow-clip rounded-xl border border-gray-700"
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
        <PartySlotWorkspace
          slots={slots}
          partyNumber={partyNumber}
          autoRegearEnabled={autoRegearEnabled}
          isBombSquadParty={isBombSquad}
          eventCategory={eventCategory}
          timezone={timezone}
          showTemplatePalette={!isCallerScoped}
          onChange={setSlots}
        />

        {error && (
          <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3" role="alert">
            <p className="text-red-400 text-sm">{error}</p>
            {staleConflict && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-red-500/15 px-3 text-xs font-bold text-red-200 transition-[background-color,scale] duration-150 hover:bg-red-500/25 active:scale-[0.96]"
                >
                  <RefreshCcw size={14} /> {t('staleReload')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setStaleConflict(false)
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-gray-300 transition-[background-color,scale] duration-150 hover:bg-gray-800 active:scale-[0.96]"
                >
                  <X size={14} /> {t('staleKeepEditing')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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
