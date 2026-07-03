'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Loader2, ShieldAlert } from 'lucide-react'
import {
  approveMemberAlbionIdentity,
  disputeMemberAlbionIdentity,
} from '@/app/actions/stats-admin'
import { useToast } from './ToastProvider'

interface Props {
  discordId: string
  username: string
}

export default function AlbionIdentityReviewButtons({ discordId, username }: Props) {
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('albionIdentityReview')
  const [isPending, startTransition] = useTransition()

  const run = (mode: 'approve' | 'dispute') => {
    startTransition(async () => {
      const res =
        mode === 'approve'
          ? await approveMemberAlbionIdentity(discordId)
          : await disputeMemberAlbionIdentity(discordId)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        mode === 'approve'
          ? t('approveSuccess', { username })
          : t('disputeSuccess', { username }),
      )
      if (
        mode === 'approve' &&
        'discordNicknameSyncFailed' in res &&
        res.discordNicknameSyncFailed
      ) {
        toast.info(t('nicknameSyncFailed'), 7000)
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        type="button"
        onClick={() => run('approve')}
        disabled={isPending}
        className="inline-flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[11px] px-2 py-1 rounded disabled:opacity-50"
        title={t('approveTooltip')}
      >
        {isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
        {t('approve')}
      </button>
      <button
        type="button"
        onClick={() => run('dispute')}
        disabled={isPending}
        className="inline-flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px] px-2 py-1 rounded disabled:opacity-50"
        title={t('disputeTooltip')}
      >
        <ShieldAlert size={11} />
        {t('dispute')}
      </button>
    </div>
  )
}
