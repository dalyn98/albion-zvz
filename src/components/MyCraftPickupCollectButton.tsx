'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { markCraftPickupCollected } from '@/app/actions/craft'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from './ToastProvider'

interface Props {
  taskId: string
}

// 작업 회수 확정 버튼. 누르면 status='collected' 로 전환되며 reimbursement_silver
// 만큼 point_ledger 에 craft_reimbursement 가 적립된다.
export default function MyCraftPickupCollectButton({ taskId }: Props) {
  const t = useTranslations('craftPickup')
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const askConfirm = useConfirm()

  const onClick = async () => {
    if (pending) return
    const ok = await askConfirm({ body: t('confirmCollected'), destructive: false })
    if (!ok) return
    startTransition(async () => {
      const r = await markCraftPickupCollected(taskId)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('toastCollected'))
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
    >
      <Check size={12} />
      {pending ? t('collecting') : t('collectButton')}
    </button>
  )
}
