'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
import { deleteTemplate } from '@/app/actions/templates'
import { useConfirm } from '@/components/ConfirmDialog'

export default function DeleteTemplateButton({
  id,
  name,
}: {
  id: string
  name: string
}) {
  const router = useRouter()
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const [pending, startTransition] = useTransition()
  const askConfirm = useConfirm()

  const handleClick = async () => {
    const ok = await askConfirm({
      body: t('confirmDeleteTemplate', { name }),
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteTemplate(id)
      if (result.error) alert(result.error)
      else router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
      aria-label={tCommon('delete')}
    >
      <Trash2 size={15} />
    </button>
  )
}
