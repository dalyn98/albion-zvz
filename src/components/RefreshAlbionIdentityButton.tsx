'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, RefreshCw } from 'lucide-react'
import { refreshMyAlbionIdentity } from '@/app/actions/onboarding'
import { useToast } from './ToastProvider'

export default function RefreshAlbionIdentityButton() {
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('albionIdentityProfile')
  const [isPending, startTransition] = useTransition()

  const run = () => {
    startTransition(async () => {
      const res = await refreshMyAlbionIdentity()
      if (res.throttledUntil) {
        toast.error(t('refreshThrottle', { time: formatShort(res.throttledUntil) }))
        return
      }
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(t('refreshSuccess'))
      if (res.discordNicknameSyncFailed) {
        toast.info(t('refreshNicknameSyncFailed'), 7000)
      }
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 rounded border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:border-amber-500/50 hover:text-white disabled:opacity-50"
      title={t('refreshTooltip')}
    >
      {isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
      {t('refresh')}
    </button>
  )
}

function formatShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
