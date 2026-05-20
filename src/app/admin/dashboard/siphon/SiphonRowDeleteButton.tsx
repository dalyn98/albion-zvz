'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteSiphonRow } from '@/app/actions/siphon-admin'

interface Props {
  id: string
}

export default function SiphonRowDeleteButton({ id }: Props) {
  const router = useRouter()
  const t = useTranslations('adminSiphonPage')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    if (pending) return
    if (!confirm(t('logDeleteConfirm'))) return
    setError(null)
    startTransition(async () => {
      const result = await deleteSiphonRow(id)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center gap-2">
      {error && (
        <span className="text-xs text-rose-300">
          {t('logDeleteError', { error })}
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-gray-500 hover:text-rose-300 transition-colors disabled:text-gray-700"
        title={t('logDelete')}
      >
        {pending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Trash2 size={12} />
        )}
      </button>
    </div>
  )
}
