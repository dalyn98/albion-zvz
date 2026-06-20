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
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  message: string
  duration: number
}

interface ShowOptions {
  kind?: ToastKind
  duration?: number
}

interface ToastContextValue {
  show: (message: string, options?: ShowOptions) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATIONS: Record<ToastKind, number> = {
  success: 3000,
  info: 3500,
  error: 5000,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, options?: ShowOptions) => {
    const kind = options?.kind ?? 'info'
    const duration = options?.duration ?? DEFAULT_DURATIONS[kind]
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, kind, message, duration }])
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message, duration) => show(message, { kind: 'success', duration }),
      error: (message, duration) => show(message, { kind: 'error', duration }),
      info: (message, duration) => show(message, { kind: 'info', duration }),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}

interface ViewportProps {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

function ToastViewport({ toasts, onDismiss }: ViewportProps) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 py-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

interface RowProps {
  toast: Toast
  onDismiss: (id: number) => void
}

function ToastRow({ toast, onDismiss }: RowProps) {
  const tCommon = useTranslations('common')

  useEffect(() => {
    if (toast.duration <= 0) return
    const handle = window.setTimeout(() => onDismiss(toast.id), toast.duration)
    return () => window.clearTimeout(handle)
  }, [toast.id, toast.duration, onDismiss])

  const styles = STYLES[toast.kind]
  const Icon = styles.icon

  return (
    <div
      role="status"
      className={`pointer-events-auto w-full sm:w-auto sm:min-w-[260px] sm:max-w-sm flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md ${styles.container}`}
    >
      <Icon size={18} className={`mt-0.5 flex-shrink-0 ${styles.icon_color}`} />
      <p className="flex-1 min-w-0 text-sm text-white whitespace-pre-wrap break-words">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 text-gray-400 hover:text-white -mt-0.5"
        aria-label={tCommon('close')}
      >
        <X size={14} />
      </button>
    </div>
  )
}

const STYLES: Record<
  ToastKind,
  {
    container: string
    icon: React.ComponentType<{ size?: number; className?: string }>
    icon_color: string
  }
> = {
  success: {
    container: 'bg-emerald-500/20 border-emerald-500/50',
    icon: CheckCircle2,
    icon_color: 'text-emerald-300',
  },
  error: {
    container: 'bg-rose-500/20 border-rose-500/50',
    icon: AlertCircle,
    icon_color: 'text-rose-300',
  },
  info: {
    container: 'bg-gray-800/90 border-gray-700',
    icon: Info,
    icon_color: 'text-amber-300',
  },
}
