'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cancelMyDonationRequest } from '@/app/actions/donation'
import { useToast } from './ToastProvider'

export default function DonationRequestCancelButton({ id }: { id: string }) {
  const router = useRouter()
  const t = useTranslations('me')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const cancel = () => {
    setError('')
    startTransition(async () => {
      const result = await cancelMyDonationRequest(id)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(tToast('donationCancelled'))
      router.refresh()
    })
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1 text-xs text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-2.5 py-1 rounded mt-1"
      >
        <X size={11} />
        {t('donationCancel')}
      </button>
    )
  }

  return (
    <div className="space-y-2 mt-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
      <p className="text-red-200 text-xs">
        {t('donationCancelConfirm')}
      </p>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded text-xs"
        >
          {t('donationCancelConfirmButton')}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
            setError('')
          }}
          disabled={pending}
          className="text-gray-400 hover:text-white text-xs px-3 py-1.5"
        >
          {t('donationKeep')}
        </button>
      </div>
    </div>
  )
}
