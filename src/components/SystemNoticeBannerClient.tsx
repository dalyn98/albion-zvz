'use client'

import { useState, useSyncExternalStore } from 'react'
import { Megaphone, X } from 'lucide-react'
import type { SystemNoticeSeverity } from '@/lib/super-admin-notices'

interface Props {
  id: string
  message: string
  imageUrl: string | null
  severity: SystemNoticeSeverity
  dismissLabel: string
}

const DISMISS_KEY_PREFIX = 'system-notice:dismissed:'
const DISMISS_EVENT = 'system-notice-dismissed'

function subscribeToDismissals(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(DISMISS_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(DISMISS_EVENT, onStoreChange)
  }
}

function getDismissedSnapshot(id: string, dismissible: boolean): boolean {
  if (!dismissible) return false
  try {
    return window.localStorage.getItem(`${DISMISS_KEY_PREFIX}${id}`) === '1'
  } catch {
    return false
  }
}

export default function SystemNoticeBannerClient({
  id,
  message,
  imageUrl,
  severity,
  dismissLabel,
}: Props) {
  const dismissible = severity === 'important'
  const [dismissedLocally, setDismissedLocally] = useState(false)
  const dismissedPersistently = useSyncExternalStore(
    subscribeToDismissals,
    () => getDismissedSnapshot(id, dismissible),
    () => false,
  )
  const dismissed = dismissedLocally || dismissedPersistently

  if (dismissed) return null

  const tone = severity === 'critical'
    ? {
        shell: 'bg-rose-500/10 border-rose-500/30',
        icon: 'text-rose-300',
        text: 'text-rose-100',
        button: 'text-rose-200 hover:bg-rose-500/20',
      }
    : {
        shell: 'bg-amber-500/10 border-amber-500/30',
        icon: 'text-amber-300',
        text: 'text-amber-100',
        button: 'text-amber-200 hover:bg-amber-500/20',
      }

  function dismiss() {
    try {
      window.localStorage.setItem(`${DISMISS_KEY_PREFIX}${id}`, '1')
    } catch {
      // Strict privacy modes can disable storage. The critical path remains
      // available; this best-effort preference simply cannot persist there.
    }
    setDismissedLocally(true)
    window.dispatchEvent(new Event(DISMISS_EVENT))
  }

  return (
    <div
      className={`${tone.shell} border-b px-4 py-2.5`}
      data-system-notice-severity={severity}
    >
      <div className="max-w-7xl mx-auto flex items-start gap-3">
        <Megaphone size={14} className={`${tone.icon} mt-0.5 flex-shrink-0`} />
        <div className="flex-1 min-w-0 space-y-2">
          {message && (
            <p className={`${tone.text} text-sm whitespace-pre-wrap break-words`}>
              {message}
            </p>
          )}
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              width={512}
              height={128}
              className={`h-32 w-auto max-w-full rounded-md border ${tone.shell} object-contain`}
            />
          )}
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={dismissLabel}
            className={`${tone.button} -m-1 rounded-md p-1 transition-colors`}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
