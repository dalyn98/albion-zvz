'use client'

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'

// 이벤트 편집 화면의 여러 섹션(EventInfoForm, BattleOutcomeEditor, 파티 편집기)
// 을 하나의 "저장" 버튼으로 커밋하기 위한 공용 레지스트리.
//
// 각 섹션은 useRegisterSave(id, fn) 으로 자신을 등록만 하고, 실제 버튼은
// EventEditSaveBar 가 단일 제공. 개별 섹션의 save 버튼은 편집 모드에서 숨긴다.
//
// 에러는 id 라벨과 함께 수집되어 상단 바에 표시. 저장 순서는 등록 순서대로,
// 직렬 — 병렬로 하면 서버 액션 쪽 revalidate 가 중복·경합될 수 있어서.

export interface SaveResult {
  error?: string
}

type SaveFn = () => Promise<SaveResult>

interface Ctx {
  register: (id: string, label: string, fn: SaveFn) => () => void
  triggerSaveAll: () => Promise<Array<{ id: string; label: string; error: string }>>
}

const EventEditSaveContext = createContext<Ctx | null>(null)

export function EventEditSaveProvider({ children }: { children: ReactNode }) {
  // Ref 로 두는 이유: register/unregister 가 렌더를 유발하지 않도록 하기 위함.
  // 저장 실행 시점에 Map 을 스냅샷해 iterate 하므로 중간 변동도 안전.
  const registryRef = useRef<Map<string, { label: string; fn: SaveFn }>>(new Map())

  const register = useCallback((id: string, label: string, fn: SaveFn) => {
    registryRef.current.set(id, { label, fn })
    return () => {
      registryRef.current.delete(id)
    }
  }, [])

  const triggerSaveAll = useCallback(async () => {
    const errors: Array<{ id: string; label: string; error: string }> = []
    // Iterator 스냅샷으로 순회 — 저장 중 등록 변동이 있어도 이번 라운드는 고정.
    const entries = Array.from(registryRef.current.entries())
    for (const [id, { label, fn }] of entries) {
      try {
        const r = await fn()
        if (r.error) errors.push({ id, label, error: r.error })
      } catch (e) {
        errors.push({ id, label, error: e instanceof Error ? e.message : 'unknown error' })
      }
    }
    return errors
  }, [])

  return (
    <EventEditSaveContext.Provider value={{ register, triggerSaveAll }}>
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

export function useEventEditSaveAll(): Ctx | null {
  return useContext(EventEditSaveContext)
}
