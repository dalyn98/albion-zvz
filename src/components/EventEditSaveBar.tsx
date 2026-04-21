'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save } from 'lucide-react'
import { useEventEditSaveAll } from './EventEditSaveRegistry'

// 이벤트 편집 화면 하단 고정 저장 바. 등록된 섹션 전체를 순차 저장하고
// 에러를 모아 표시. 섹션별 save 버튼을 숨기고 이 바로만 커밋하게 한다.
export default function EventEditSaveBar() {
  const ctx = useEventEditSaveAll()
  const t = useTranslations('adminEditEvent')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Array<{ id: string; label: string; error: string }>>([])
  const [justSaved, setJustSaved] = useState(false)

  const handleClick = async () => {
    if (!ctx || saving) return
    setSaving(true)
    setErrors([])
    setJustSaved(false)
    const errs = await ctx.triggerSaveAll()
    setErrors(errs)
    setSaving(false)
    if (errs.length === 0) {
      setJustSaved(true)
      router.refresh()
      // 성공 플래시는 잠깐만 — 저장 직후 DB 상태가 반영되었음을 시각적으로만 알림.
      setTimeout(() => setJustSaved(false), 2000)
    }
  }

  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 -mx-4 sm:mx-0 mt-6 bg-gray-950/95 backdrop-blur border-t border-gray-800 px-4 py-3">
      {errors.length > 0 && (
        <ul className="mb-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-300 text-xs space-y-0.5 max-h-28 overflow-y-auto">
          {errors.map((e) => (
            <li key={e.id}>
              <span className="font-semibold">{e.label}:</span> {e.error}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span className="text-green-400 text-xs">{t('saveAllSuccess')}</span>
        )}
        <button
          type="button"
          onClick={handleClick}
          disabled={saving || !ctx}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
        >
          <Save size={15} />
          {saving ? tCommon('saving') : t('saveAll')}
        </button>
      </div>
    </div>
  )
}
