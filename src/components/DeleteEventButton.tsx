'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
import { deleteEvent } from '@/app/actions/admin'

export default function DeleteEventButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const t = useTranslations('adminDashboard')
  const tCommon = useTranslations('common')

  const handleDelete = async () => {
    if (!confirm(t('confirmDeleteEvent'))) return
    const result = await deleteEvent(eventId)
    if (result.error) alert(result.error)
    else router.refresh()
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
