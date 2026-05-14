'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import SlotEditor, { type SlotInput } from './SlotEditor'
import { useToast } from './ToastProvider'
import { updateSingleSlot } from '@/app/actions/admin'
import { slotToInput } from '@/lib/slot-to-input'
import type { EventCategory, Slot } from '@/types'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  slot: Slot
  partyNumber: number
  autoRegearEnabled: boolean
  eventCategory?: EventCategory
  onClose: () => void
}

// 단일 슬롯 편집 모달. SlotCard 의 관리자 전용 편집 버튼에서만 마운트된다.
// SlotEditor 의 standaloneMode 로 붙어서 접힌 요약 행 없이 곧바로 편집 UI 를
// 띄우고, 저장 버튼이 서버 액션(updateSingleSlot) 을 호출한다. 모달이 닫히면
// 부모(SlotCard) 가 언마운트하므로 로컬 state 는 보존할 필요 없음.
export default function SingleSlotEditModal({
  slot,
  partyNumber,
  autoRegearEnabled,
  eventCategory,
  onClose,
}: Props) {
  const t = useTranslations('slot')
  const tCommon = useTranslations('common')
  const tUnsaved = useTranslations('unsavedChanges')
  const toast = useToast()
  const router = useRouter()
  const initialSnap = JSON.stringify(slotToInput(slot))
  const [input, setInput] = useState<SlotInput>(() => slotToInput(slot))
  // savedRef 는 "마지막 저장 시점 스냅샷" 의 동기 보관소. setState 는 React 가
  // 다음 렌더까지 비동기 batched 로 미루지만, 같은 클릭 안에서 SlotEditor 의
  // save 버튼 onClick 이 await onSave() 직후 standaloneMode.onClose() 를 호출할 때
  // 그 standaloneMode 는 클릭 시점의 stale closure 라 handleClose 안의 dirty 가
  // 아직 true 로 평가된다. ref 로 동기 갱신해 stale handleClose 도 "방금 저장됨" 을
  // 즉시 인지하게 한다.
  const savedRef = useRef<string>(initialSnap)
  const [savedSerialized, setSavedSerialized] = useState<string>(initialSnap)
  const dirty = JSON.stringify(input) !== savedSerialized
  useReportDirty(`single-slot-edit:${slot.id}`, dirty)

  const handleSave = async (): Promise<boolean> => {
    const result = await updateSingleSlot(slot.id, {
      is_hidden: input.is_hidden,
      role_name: input.role_name,
      notes: input.notes,
      items: input.items,
      options: input.options,
      spells: input.spells,
      specs: input.specs,
      auto_regear_excluded: input.auto_regear_excluded,
      manual_regear_excluded: input.manual_regear_excluded,
    })
    if (result.error) {
      toast.error(result.error)
      return false
    }
    const newSnap = JSON.stringify(input)
    // ref 를 setState 보다 먼저 동기 갱신. 곧 호출될 stale handleClose 가
    // savedRef.current 를 읽어 currentDirty=false 로 판단하게 함.
    savedRef.current = newSnap
    setSavedSerialized(newSnap)
    toast.success(t('buildSaved'))
    // revalidatePath 는 서버 캐시만 무효화한다 — 현재 보고 있는 페이지 데이터를
    // 갱신하려면 클라이언트 쪽에서 router.refresh 를 호출해야 한다.
    router.refresh()
    return true
  }

  // 모달 close 시 본인 폼이 dirty 면 confirm. 다른 폼의 전역 dirty 와 무관하게
  // 이 모달 안의 미저장만 검사한다 (모달 닫기는 페이지 이탈이 아니다).
  // dirty 를 closure 가 아닌 ref + 현재 input 비교로 재계산해야 같은 클릭의
  // save → close 순차 호출에서 "방금 저장한 상태" 를 정확히 반영한다.
  const handleClose = useCallback(() => {
    const currentDirty = JSON.stringify(input) !== savedRef.current
    if (currentDirty && !window.confirm(tUnsaved('confirmLeave'))) return
    onClose()
  }, [input, onClose, tUnsaved])

  return (
    <SlotEditor
      slot={input}
      partyNumber={partyNumber}
      autoRegearEnabled={autoRegearEnabled}
      eventCategory={eventCategory}
      onChange={setInput}
      onDelete={() => {}}
      standaloneMode={{
        onSave: handleSave,
        onClose: handleClose,
        saveLabel: tCommon('save'),
        savingLabel: tCommon('saving'),
      }}
    />
  )
}
