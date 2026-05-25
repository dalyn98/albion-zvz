'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
import { deleteEvent } from '@/app/actions/admin'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from '@/components/ToastProvider'

interface Props {
  eventId: string
  redirectTo?: string
  variant?: 'icon' | 'labeled'
}

export default function DeleteEventButton({ eventId, redirectTo, variant = 'icon' }: Props) {
  const router = useRouter()
  const t = useTranslations('adminDashboard')
  const tCommon = useTranslations('common')
  const askConfirm = useConfirm()
  const toast = useToast()

  const handleDelete = async () => {
    const ok = await askConfirm({ body: t('confirmDeleteEvent'), destructive: true })
    if (!ok) return
    const result = await deleteEvent(eventId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    if (redirectTo) {
      router.push(redirectTo)
      router.refresh()
    } else {
      router.refresh()
    }
  }

  if (variant === 'labeled') {
    return (
      <button
        onClick={handleDelete}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-colors"
      >
        <Trash2 size={13} />
        {tCommon('delete')}
      </button>
    )
  }

  return (
    <button
      onClick={handleDelete}
      aria-label={tCommon('delete')}
      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
    >
      <Trash2 size={15} />
    </button>
  )
}
