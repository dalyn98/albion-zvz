'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'

// 사이트 전역 "작성 중 페이지 이탈 가드".
//
// 각 폼 컴포넌트는 useReportDirty(id, isDirty) 로 자기 상태를 보고만 하고,
// Provider 가 dirty 셋을 합산해 가드를 자동 등록한다.
//
//   1) 브라우저 닫기 / 새로고침 / 주소창 변경 → window.beforeunload
//   2) 사이트 내 <Link> 이동 → <GuardedLink> 가 Next 16 onNavigate API 로 막음
//   3) 사이트 내 router.push/replace/back/forward → useGuardedRouter() 로 막음
//
// 저장 성공 후에는 useReportDirty 가 isDirty=false 로 재호출돼 자동 해제.
// 강제로 비우려면 useUnsavedChanges().clearAll() 호출.

interface UnsavedChangesContextValue {
  hasUnsavedChanges: boolean
  reportDirty: (id: string, isDirty: boolean) => void
  confirmLeave: () => boolean
  clearAll: () => void
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  // Ref + state 분리: register/unregister 가 자체적으로 렌더를 유발하지 않도록.
  // 외부 노출용 hasUnsavedChanges 만 setState 로 변경 알림.
  const dirtyRef = useRef<Set<string>>(new Set())
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const t = useTranslations('unsavedChanges')

  const reportDirty = useCallback((id: string, isDirty: boolean) => {
    if (isDirty) dirtyRef.current.add(id)
    else dirtyRef.current.delete(id)
    setHasUnsavedChanges(dirtyRef.current.size > 0)
  }, [])

  const clearAll = useCallback(() => {
    dirtyRef.current.clear()
    setHasUnsavedChanges(false)
  }, [])

  const confirmLeave = useCallback((): boolean => {
    if (dirtyRef.current.size === 0) return true
    return window.confirm(t('confirmLeave'))
  }, [t])

  // beforeunload 는 hasUnsavedChanges 일 때만 등록. 메시지 텍스트는 모든
  // 모던 브라우저가 무시하고 자체 prompt 를 띄움 — returnValue 가 truthy 면 충분.
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({ hasUnsavedChanges, reportDirty, confirmLeave, clearAll }),
    [hasUnsavedChanges, reportDirty, confirmLeave, clearAll],
  )

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  )
}

// 폼이 자신의 dirty 상태를 보고. id 는 폼 인스턴스 단위로 고유 — 예: 'regear-request',
// `event-edit:party-${partyNumber}`. 같은 id 로 두 번 호출되면 마지막 값이 우선.
//
// Provider 가 없는 트리(예: marketing/public)에서도 안전: ctx 가 null 이면 no-op.
export function useReportDirty(id: string, isDirty: boolean): void {
  const ctx = useContext(UnsavedChangesContext)
  const reportDirty = ctx?.reportDirty
  useEffect(() => {
    if (!reportDirty) return
    reportDirty(id, isDirty)
    return () => {
      reportDirty(id, false)
    }
  }, [reportDirty, id, isDirty])
}

// Provider 가 없는 트리에서 useUnsavedChanges 가 반환할 안정적 fallback.
// 매번 새 객체를 만들면 소비자의 useCallback/useMemo deps 가 매 렌더마다 무효화돼
// 무한 effect 가 돌 수 있다 — 모듈 상수로 단일 객체 공유.
const FALLBACK: UnsavedChangesContextValue = {
  hasUnsavedChanges: false,
  reportDirty: () => {},
  confirmLeave: () => true,
  clearAll: () => {},
}

// 폼이 저장 직후 dirty 셋을 즉시 비우거나 hasUnsavedChanges 를 읽기 위해 사용.
// Provider 가 없으면 no-op fallback 반환.
export function useUnsavedChanges(): UnsavedChangesContextValue {
  return useContext(UnsavedChangesContext) ?? FALLBACK
}

// useRouter 의 push/replace/back/forward 만 가드. refresh/prefetch 는 데이터
// 갱신 용도라 사용자 이탈이 아니므로 그대로 통과.
export function useGuardedRouter() {
  const router = useRouter()
  const ctx = useContext(UnsavedChangesContext)

  return useMemo(() => {
    const allow = () => !ctx || ctx.confirmLeave()
    return {
      push: (href: string, options?: Parameters<typeof router.push>[1]) => {
        if (allow()) router.push(href, options)
      },
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => {
        if (allow()) router.replace(href, options)
      },
      back: () => {
        if (allow()) router.back()
      },
      forward: () => {
        if (allow()) router.forward()
      },
      refresh: () => router.refresh(),
      prefetch: router.prefetch.bind(router),
    }
  }, [router, ctx])
}

// 기존 <Link> 의 drop-in 대체. dirty 시 Next 16 onNavigate API 로 client-side
// navigation 을 막음. 외부 링크(다른 origin) / 새 탭(Ctrl+클릭) / download 는
// onNavigate 가 호출되지 않으므로 자연스럽게 통과 (beforeunload 가 잡는다).
type GuardedLinkProps = ComponentProps<typeof Link>

export function GuardedLink({ onNavigate, ...rest }: GuardedLinkProps) {
  const ctx = useContext(UnsavedChangesContext)
  return (
    <Link
      {...rest}
      onNavigate={(e) => {
        if (ctx && !ctx.confirmLeave()) {
          e.preventDefault()
          return
        }
        onNavigate?.(e)
      }}
    />
  )
}
