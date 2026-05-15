'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'

// 사이트 공통 확인 모달.
//
// window.confirm 의 대체. async hook 으로 호출하면 사용자가 확인/취소 누를 때까지
// Promise 가 풀리지 않는다. body 만 넘기면 단순 prompt 와 동일, options 객체를
// 넘기면 title/buttons/destructive 스타일까지 제어 가능.
//
// Provider 가 없는 트리(/onboard 라우트, 마케팅 페이지 등 일부) 에서는 useConfirm
// 이 window.confirm 폴백을 반환 — 외부 영향 없이 graceful degrade.

interface ConfirmOptions {
  title?: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  // true 면 확인 버튼이 위험 액션 색(rose) 으로. 삭제/취소/되돌리기 같은
  // 되돌릴 수 없는 액션 호출 시 명시적으로 지정.
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  // Promise resolver 를 Ref 로 보관 — finish() 가 같은 resolver 를 두 번 호출하지
  // 않도록 호출 직후 null 로 비움.
  const resolverRef = useRef<((v: boolean) => void) | null>(null)
  const t = useTranslations('common')

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const normalized = typeof opts === 'string' ? { body: opts } : opts
    setOptions(normalized)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      // 이전 다이얼로그가 안 닫힌 상태에서 새 호출이 오면 이전 promise 는 false
      // 로 떨어뜨려 한 번에 하나의 다이얼로그만 활성 — 호출자 양쪽이 hanging
      // 되지 않게.
      resolverRef.current?.(false)
      resolverRef.current = resolve
    })
  }, [])

  const finish = useCallback((value: boolean) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setOpen(false)
    setOptions(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
      if (e.key === 'Enter') finish(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {open && options && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4"
          onClick={() => finish(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-body"
            className="bg-gray-900 border border-gray-700 w-full max-w-md rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3">
              <h3
                id="confirm-dialog-title"
                className="text-white font-bold text-lg mb-2"
              >
                {options.title ?? t('confirmTitle')}
              </h3>
              <p
                id="confirm-dialog-body"
                className="text-gray-300 text-sm whitespace-pre-wrap break-words"
              >
                {options.body}
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5 pt-2">
              <button
                type="button"
                className="px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg"
                onClick={() => finish(false)}
              >
                {options.cancelLabel ?? t('cancel')}
              </button>
              <button
                type="button"
                autoFocus
                className={
                  options.destructive
                    ? 'px-4 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold'
                    : 'px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold'
                }
                onClick={() => finish(true)}
              >
                {options.confirmLabel ?? t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    // Provider 미마운트 트리(테스트, 마케팅 페이지 일부) 에서는 native confirm 폴백.
    return async (opts) =>
      window.confirm(typeof opts === 'string' ? opts : opts.body)
  }
  return ctx
}
