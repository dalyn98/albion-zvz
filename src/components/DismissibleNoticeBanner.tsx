'use client'

import { useEffect, useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  storageKey: string
  message: string
  imageUrl?: string
}

// Admin-authored notice banners shared between the events list and the regear
// page. We re-show the banner whenever the message or image changes by keying
// the dismissed flag on the content itself — when admins edit the notice,
// every user sees it once again, then can dismiss.
export default function DismissibleNoticeBanner({ storageKey, message, imageUrl }: Props) {
  const t = useTranslations('common')
  const [dismissed, setDismissed] = useState(false)
  const trimmed = message.trim()
  const trimmedImage = (imageUrl ?? '').trim()
  const fullKey = `app.notice.dismissed.${storageKey}`
  const dismissSignature = `${trimmed}|${trimmedImage}`

  useEffect(() => {
    if (!trimmed && !trimmedImage) return
    try {
      const stored = window.localStorage.getItem(fullKey)
      if (stored === dismissSignature) setDismissed(true)
    } catch {
      // Ignore storage errors (Safari private mode, etc.) — banner stays visible.
    }
  }, [fullKey, dismissSignature, trimmed, trimmedImage])

  if ((!trimmed && !trimmedImage) || dismissed) return null

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(fullKey, dismissSignature)
    } catch {
      // If storage fails, still hide for this session.
    }
    setDismissed(true)
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <Megaphone size={16} className="text-amber-300 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          {trimmed && (
            <p className="text-amber-100 text-sm whitespace-pre-wrap break-words">
              {trimmed}
            </p>
          )}
          {trimmedImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={trimmedImage}
              alt=""
              className="w-full h-auto rounded-md border border-amber-500/20 block"
            />
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t('close')}
          className="text-amber-200/60 hover:text-amber-100 flex-shrink-0 -mt-0.5"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
