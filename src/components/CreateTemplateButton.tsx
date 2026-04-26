'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { createTemplate } from '@/app/actions/templates'

// 빈 템플릿을 처음부터 만든다. 클릭하면 inline form 으로 토글되어 이름만 입력
// 받고, 성공 시 편집 화면으로 라우팅 — 거기서 파티/슬롯을 채운다.
// 같은 이름이 이미 있으면 conflictId 를 받아 "이미 있는 템플릿으로 이동" 옵션을
// 보여준다 (실수 중복 방지 + 기존 편집으로 매끄럽게 유도).
export default function CreateTemplateButton() {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<{ id: string; name: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const reset = () => {
    setOpen(false)
    setName('')
    setError('')
    setConflict(null)
  }

  const submit = () => {
    setError('')
    setConflict(null)
    startTransition(async () => {
      const result = await createTemplate(name)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.conflictId && result.conflictName) {
        setConflict({ id: result.conflictId, name: result.conflictName })
        return
      }
      if (result.id) {
        router.push(`/admin/dashboard/templates/${result.id}`)
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus size={14} />
        {t('createTemplateButton')}
      </button>
    )
  }

  return (
    <div className="bg-gray-900 border border-amber-500/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-white text-sm font-semibold">{t('createTemplateTitle')}</h3>
        <button
          type="button"
          onClick={reset}
          className="text-gray-500 hover:text-white"
          aria-label={tCommon('cancel')}
        >
          <X size={16} />
        </button>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        autoFocus
        placeholder={t('templateNamePlaceholder')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !pending) {
            e.preventDefault()
            submit()
          }
        }}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
      {conflict && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 space-y-2">
          <p className="text-amber-200 text-xs">
            {t('createConflict', { name: conflict.name })}
          </p>
          <button
            type="button"
            onClick={() => router.push(`/admin/dashboard/templates/${conflict.id}`)}
            className="text-amber-300 hover:text-amber-200 text-xs font-semibold underline"
          >
            {t('createConflictGoEdit')}
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="text-gray-400 hover:text-white text-sm px-3 py-1.5"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || name.trim().length === 0}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold text-sm px-4 py-1.5 rounded-lg transition-colors"
        >
          {pending ? t('creatingDots') : t('createButton')}
        </button>
      </div>
    </div>
  )
}
