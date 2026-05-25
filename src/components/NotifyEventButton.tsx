'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bell, Check, Loader2 } from 'lucide-react'
import { notifyEvent } from '@/app/actions/admin'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from '@/components/ToastProvider'

// How long to show the "sent" checkmark before reverting to the bell icon.
const SUCCESS_FLASH_MS = 2000

export default function NotifyEventButton({
  eventId,
  disabled = false,
  disabledTitle,
}: {
  eventId: string
  disabled?: boolean
  disabledTitle?: string
}) {
  const t = useTranslations('adminDashboard')
  const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle')
  const askConfirm = useConfirm()
  const toast = useToast()

  const handleClick = async () => {
    if (disabled || state !== 'idle') return
    const ok = await askConfirm({ body: t('notifyConfirm'), destructive: false })
    if (!ok) return
    setState('loading')
    const result = await notifyEvent(eventId)
    if (result.error) {
      toast.error(`${t('notifyErrorPrefix')}: ${result.error}`)
      setState('idle')
      return
    }
    setState('success')
    setTimeout(() => setState('idle'), SUCCESS_FLASH_MS)
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state !== 'idle'}
      title={disabled ? disabledTitle : t('notifyTitle')}
      aria-label={t('notifyTitle')}
      className="p-2 text-gray-400 hover:text-amber-300 hover:bg-gray-700 rounded-lg transition-colors disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      {state === 'loading' ? (
        <Loader2 size={15} className="animate-spin" />
      ) : state === 'success' ? (
        <Check size={15} className="text-emerald-400" />
      ) : (
        <Bell size={15} />
      )}
    </button>
  )
}
