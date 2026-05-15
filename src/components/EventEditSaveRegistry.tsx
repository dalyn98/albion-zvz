'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useUnsavedChanges } from './UnsavedChangesProvider'

// 이벤트 편집 화면의 여러 섹션(EventInfoForm, 파티 편집기)을 하나의 "저장"
// 버튼으로 커밋하기 위한 공용 레지스트리.
//
// 각 섹션은 useRegisterSave(id, fn) 으로 자신을 등록만 하고, 실제 버튼은
// EventEditSaveBar 가 단일 제공. 개별 섹션의 save 버튼은 편집 모드에서 숨긴다.
//
// 에러는 id 라벨과 함께 수집되어 상단 바에 표시. 저장은 병렬 — 각 섹션이
// 만지는 행이 분리돼 있다(EventInfoForm=events row, PartyEditorPanel #N=parties
// + slots rows). revalidatePath 는 Next 가 dedupe 하므로 중복 호출 무해.
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
}

const EventEditSaveContext = createContext<Ctx | null>(null)

export function EventEditSaveProvider({ children }: { children: ReactNode }) {
  // Ref 로 두는 이유: register/unregister 가 렌더를 유발하지 않도록 하기 위함.
  // 저장 실행 시점에 Map 을 스냅샷해 iterate 하므로 중간 변동도 안전.
  const registryRef = useRef<Map<string, { label: string; fn: SaveFn }>>(new Map())
  const dirtyRef = useRef<Set<string>>(new Set())
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const globalUnsaved = useUnsavedChanges()

  const register = useCallback((id: string, label: string, fn: SaveFn) => {
    registryRef.current.set(id, { label, fn })
    return () => {
      registryRef.current.delete(id)
    }
  }, [])

  const reportDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyRef.current.add(id)
    else dirtyRef.current.delete(id)
    setHasUnsavedChanges(dirtyRef.current.size > 0)
    // 글로벌 가드(GuardedLink, useGuardedRouter)가 사이트 내 이동을 가로채려면
    // 이쪽 dirty 도 글로벌 셋에 반영되어야 함. 키 충돌을 막기 위해 prefix.
    globalUnsaved.reportDirty(`event-edit:${id}`, dirty)
  }, [globalUnsaved])

  const triggerSaveAll = useCallback(async () => {
    // Iterator 스냅샷으로 순회 — 저장 중 등록 변동이 있어도 이번 라운드는 고정.
    const entries = Array.from(registryRef.current.entries())
    // 각 섹션을 병렬 실행. 한 섹션의 throw 가 다른 섹션을 취소하지 않도록
    // 각자 try/catch 로 감싸 결과 배열을 만든 뒤 Promise.all 로 모은다.
    const results = await Promise.all(
      entries.map(async ([id, { label, fn }]) => {
        try {
          const r = await fn()
          if (r.error) return { id, label, error: r.error }
          return null
        } catch (e) {
          return { id, label, error: e instanceof Error ? e.message : 'unknown error' }
        }
      }),
    )
    const errors = results.filter((r): r is { id: string; label: string; error: string } => r !== null)
    // 저장 성공 시 dirty 셋을 비워 beforeunload 를 즉시 해제. 각 섹션의
    // useReportDirty effect 도 다음 렌더에 같은 결과를 보고하지만, 여기서
    // 미리 비워야 redirect 직후 confirm 다이얼로그가 안 뜬다. 글로벌도 같이.
    if (errors.length === 0) {
      for (const id of dirtyRef.current) {
        globalUnsaved.reportDirty(`event-edit:${id}`, false)
      }
      dirtyRef.current.clear()
      setHasUnsavedChanges(false)
    }
    return errors
  }, [globalUnsaved])

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

  return (
    <EventEditSaveContext.Provider value={{ register, triggerSaveAll, reportDirty, hasUnsavedChanges }}>
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
  const fnRef = useRef(fn)
  // 최신 closure 를 항상 참조하도록 ref 갱신. 이렇게 해야 섹션의 내부 state 가
  // 바뀌어도 저장 시 최신 값을 기준으로 서버 액션을 호출한다.
  useEffect(() => {
    fnRef.current = fn
  })
  useEffect(() => {
    if (!ctx || !enabled) return
    const stable: SaveFn = () => fnRef.current()
    return ctx.register(id, label, stable)
  }, [ctx, id, label, enabled])
}

// 각 섹션이 dirty 상태를 보고. id 는 useRegisterSave 와 동일 키 사용 권장.
// dirty 가 true 인 섹션이 하나라도 있으면 Provider 가 beforeunload 를 단다.
export function useReportDirty(id: string, isDirty: boolean): void {
  const ctx = useContext(EventEditSaveContext)
  useEffect(() => {
    if (!ctx) return
    ctx.reportDirty(id, isDirty)
    return () => {
      ctx.reportDirty(id, false)
    }
  }, [ctx, id, isDirty])
}

export function useEventEditSaveAll(): Ctx | null {
  return useContext(EventEditSaveContext)
}
