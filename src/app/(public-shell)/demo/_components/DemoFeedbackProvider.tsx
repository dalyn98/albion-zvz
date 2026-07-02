'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, X } from 'lucide-react'

// 데모 라우트 전역 toast — 모든 disabled 액션 버튼이 클릭되면 "데모이므로 저장되지
// 않아요" 안내를 띄운다. 진짜 어드민 화면의 클릭 감각을 보존하기 위해 버튼은
// disabled 가 아니라 onClick 으로 toast 만 띄우는 형태로 변환된다.

const TOAST_AUTO_DISMISS_MS = 2800

interface DemoToastContextValue {
  showToast: (message: string) => void
}

const DemoToastContext = createContext<DemoToastContextValue | null>(null)

export function useDemoToast(): DemoToastContextValue {
  const ctx = useContext(DemoToastContext)
  if (!ctx) {
    throw new Error('useDemoToast must be used inside <DemoFeedbackProvider>')
  }
  return ctx
}

export default function DemoFeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(next)
    timerRef.current = setTimeout(() => setMessage(null), TOAST_AUTO_DISMISS_MS)
  }, [])

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(null)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const value = useMemo<DemoToastContextValue>(() => ({ showToast }), [showToast])

  return (
    <DemoToastContext.Provider value={value}>
      {children}
      <DemoToastViewport message={message} onDismiss={dismiss} />
    </DemoToastContext.Provider>
  )
}

function DemoToastViewport({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  const tCommon = useTranslations('common')

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
    >
      <div
        role="status"
        className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/95 px-4 py-2 text-xs font-bold text-black shadow-2xl shadow-black/40 transition-[opacity,transform] duration-200 ease-out sm:text-sm ${
          message ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <Sparkles size={14} className="shrink-0" />
        <span className="whitespace-pre-wrap">{message ?? ''}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={tCommon('close')}
          className="ml-1 -mr-1 rounded-full p-0.5 text-black/70 hover:bg-black/10 hover:text-black"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
