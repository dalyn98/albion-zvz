'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Copy } from 'lucide-react'
import { cloneEvent } from '@/app/actions/admin'
import { useToast } from './ToastProvider'

export default function DuplicateEventButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const t = useTranslations('adminDashboard')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const handleClick = () => {
    if (!confirm(t('duplicateConfirm'))) return
    startTransition(async () => {
      const result = await cloneEvent(eventId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(tToast('eventDuplicated'))
      if (result.id) {
        router.push(`/admin/dashboard/events/${result.id}`)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={t('duplicateAria')}
      className="p-2 text-gray-400 hover:text-amber-300 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
    >
      <Copy size={15} />
    </button>
  )
}
