'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Copy } from 'lucide-react'
import { duplicateTemplate } from '@/app/actions/templates'
import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'

// 템플릿 행 우측의 복사 버튼. 클릭하면 서버에서 새 row 를 만들고 곧장 그
// 편집 화면으로 이동시킨다. 새 이름은 server action 이 "{원본} (복사)" 류로
// 자동 생성하므로 추가 입력은 필요 없다 — 사용자는 편집 화면에서 자유롭게
// 이름을 바꾸면 된다.
export default function DuplicateTemplateButton({ id }: { id: string }) {
  const t = useTranslations('adminTemplates')
  const tActionError = useTranslations('adminActionError')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const onClick = () => {
    setError('')
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof duplicateTemplate>>
      try {
        result = await duplicateTemplate(id)
      } catch (error) {
        setError(getServerActionClientErrorMessage(error, {
          expired: tActionError('serverActionExpired'),
          fallback: tActionError('serverError'),
        }))
        return
      }
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.id) {
        router.push(`/admin/dashboard/templates/${result.id}`)
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="flex items-center gap-1 px-3 py-2 text-emerald-300 hover:text-emerald-200 hover:bg-gray-800 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        aria-label={t('duplicateAction')}
      >
        <Copy size={13} />
        <span className="hidden sm:inline">
          {pending ? t('duplicatingDots') : t('duplicateAction')}
        </span>
      </button>
      {error && (
        <span className="text-red-400 text-[10px] truncate max-w-[120px]" title={error}>
          {error}
        </span>
      )}
    </>
  )
}
