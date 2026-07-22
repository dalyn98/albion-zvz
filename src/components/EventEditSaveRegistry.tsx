'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useUnsavedChanges } from './UnsavedChangesProvider'
import {
  runEventSectionSaves,
  type EventSectionSaveReceipt,
} from '@/lib/event-save-runner'

// 이벤트 편집 화면의 여러 섹션(EventInfoForm, 파티 편집기)을 하나의 "저장"
// 버튼으로 커밋하기 위한 공용 레지스트리.
//
// 각 섹션은 useRegisterSave(id, fn) 으로 자신을 등록만 하고, 실제 버튼은
// EventEditSaveBar 가 단일 제공. 개별 섹션의 save 버튼은 편집 모드에서 숨긴다.
//
// 에러는 id 라벨과 함께 수집되어 상단 바에 표시. 저장은 등록 순서대로 실행하고
// 첫 실패에서 중단해 이후 섹션까지 부분 반영되는 범위를 제한한다.
//
// 미저장 변경 보호: 각 섹션이 useReportDirty(id, isDirty) 로 dirty 상태를
// 알리면 Provider 가 beforeunload 를 걸어 탭 닫기 / 새로고침 / 외부 이동을
// 막는다. 추가로 글로벌 UnsavedChangesProvider 에 `event-edit:${id}` 키로
// 위임해 사이트 내 Link/router 이동(GuardedLink, useGuardedRouter)도
// confirm 다이얼로그가 뜨도록 한다.

export interface SaveResult {
  error?: string
}

type SaveFn = () => Promise<SaveResult>

interface Ctx {
  register: (id: string, label: string, fn: SaveFn) => () => void
  triggerSaveAll: () => Promise<Array<{ id: string; label: string; error: string }>>
  reportDirty: (id: string, dirty: boolean) => void
  hasUnsavedChanges: boolean
  dirtySectionLabels: readonly string[]
  sectionReceipts: readonly EventSectionSaveReceipt[]
}

const EventEditSaveContext = createContext<Ctx | null>(null)

export function EventEditSaveProvider({ children }: { children: ReactNode }) {
  // Ref 로 두는 이유: register/unregister 가 렌더를 유발하지 않도록 하기 위함.
  // 저장 실행 시점에 Map 을 스냅샷해 iterate 하므로 중간 변동도 안전.
  const registryRef = useRef<Map<string, { label: string; fn: SaveFn }>>(new Map())
  const dirtyRef = useRef<Set<string>>(new Set())
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [dirtySectionLabels, setDirtySectionLabels] = useState<string[]>([])
  const [sectionReceipts, setSectionReceipts] = useState<EventSectionSaveReceipt[]>([])
  const globalUnsaved = useUnsavedChanges()
  const reportGlobalDirty = globalUnsaved.reportDirty

  const register = useCallback((id: string, label: string, fn: SaveFn) => {
    registryRef.current.set(id, { label, fn })
    if (dirtyRef.current.has(id)) {
      setDirtySectionLabels(Array.from(dirtyRef.current).map(
        (dirtyId) => registryRef.current.get(dirtyId)?.label ?? dirtyId,
      ))
    }
    return () => {
      registryRef.current.delete(id)
      setDirtySectionLabels(Array.from(dirtyRef.current).map(
        (dirtyId) => registryRef.current.get(dirtyId)?.label ?? dirtyId,
      ))
    }
  }, [])

  const reportDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyRef.current.add(id)
    else dirtyRef.current.delete(id)
    setHasUnsavedChanges(dirtyRef.current.size > 0)
    setDirtySectionLabels(Array.from(dirtyRef.current).map(
      (dirtyId) => registryRef.current.get(dirtyId)?.label ?? dirtyId,
    ))
    // 글로벌 가드(GuardedLink, useGuardedRouter)가 사이트 내 이동을 가로채려면
    // 이쪽 dirty 도 글로벌 셋에 반영되어야 함. 키 충돌을 막기 위해 prefix.
    reportGlobalDirty(`event-edit:${id}`, dirty)
  }, [reportGlobalDirty])

  const triggerSaveAll = useCallback(async () => {
    // Iterator 스냅샷으로 순회 — 저장 중 등록 변동이 있어도 이번 라운드는 고정.
    const entries = Array.from(registryRef.current.entries())
      .filter(([id]) => dirtyRef.current.has(id))
    setSectionReceipts([])
    const receipts = await runEventSectionSaves(
      entries.map(([id, { label, fn }]) => ({ id, label, save: fn })),
    )
    setSectionReceipts(receipts)
    for (const receipt of receipts) {
      if (receipt.status !== 'saved') continue
      dirtyRef.current.delete(receipt.id)
      reportGlobalDirty(`event-edit:${receipt.id}`, false)
    }
    setHasUnsavedChanges(dirtyRef.current.size > 0)
    setDirtySectionLabels(Array.from(dirtyRef.current).map(
      (dirtyId) => registryRef.current.get(dirtyId)?.label ?? dirtyId,
    ))
    const errors = receipts.flatMap((receipt) =>
      receipt.status === 'failed'
        ? [{ id: receipt.id, label: receipt.label, error: receipt.error }]
        : [],
    )
    return errors
  }, [reportGlobalDirty])

  // 미저장 변경이 있을 때만 beforeunload 를 등록. 모든 브라우저는 returnValue
  // 가 truthy 면 native confirm 다이얼로그를 띄운다 (메시지 텍스트는 무시됨).
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  const contextValue = useMemo<Ctx>(() => ({
    register,
    triggerSaveAll,
    reportDirty,
    hasUnsavedChanges,
    dirtySectionLabels,
    sectionReceipts,
  }), [
    dirtySectionLabels,
    hasUnsavedChanges,
    register,
    reportDirty,
    sectionReceipts,
    triggerSaveAll,
  ])

  return (
    <EventEditSaveContext.Provider value={contextValue}>
      {children}
    </EventEditSaveContext.Provider>
  )
}

// 각 섹션에서 호출. id 는 고유해야 함 (파티 편집기처럼 여러 인스턴스가 등록되면
// partyNumber 등으로 구분). label 은 에러 표시용 사람이 읽는 이름.
//
// enabled=false 이면 등록하지 않음 — 예: EventInfoForm 의 생성 모드.
export function useRegisterSave(id: string, label: string, fn: SaveFn, enabled = true): void {
  const ctx = useContext(EventEditSaveContext)
  const register = ctx?.register
  const fnRef = useRef(fn)
  // 최신 closure 를 항상 참조하도록 ref 갱신. 이렇게 해야 섹션의 내부 state 가
  // 바뀌어도 저장 시 최신 값을 기준으로 서버 액션을 호출한다.
  useEffect(() => {
    fnRef.current = fn
  })
  useEffect(() => {
    if (!register || !enabled) return
    const stable: SaveFn = () => fnRef.current()
    return register(id, label, stable)
  }, [register, id, label, enabled])
}

// 각 섹션이 dirty 상태를 보고. id 는 useRegisterSave 와 동일 키 사용 권장.
// dirty 가 true 인 섹션이 하나라도 있으면 Provider 가 beforeunload 를 단다.
export function useReportDirty(id: string, isDirty: boolean): void {
  const ctx = useContext(EventEditSaveContext)
  const reportDirty = ctx?.reportDirty
  useEffect(() => {
    if (!reportDirty) return
    reportDirty(id, isDirty)
    return () => {
      reportDirty(id, false)
    }
  }, [reportDirty, id, isDirty])
}

export function useEventEditSaveAll(): Ctx | null {
  return useContext(EventEditSaveContext)
}
