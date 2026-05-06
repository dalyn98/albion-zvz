'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pencil, Copy, Trash2 } from 'lucide-react'
import SearchBox from '@/components/SearchBox'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import type { DemoTemplate } from '@/data/demo-seed'

// `/admin/dashboard?section=templates` 의 TemplateList 비주얼 클론.
// - 같은 카드 외관 (이름 / 슬롯 수 + 지역 힌트 / 액션 버튼).
// - 액션 버튼은 disabled — 데모는 read-only.
interface Props {
  templates: DemoTemplate[]
}

export default function DemoTemplateList({ templates }: Props) {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return templates
    return templates.filter((tpl) => matchesName(tpl.name, q))
  }, [templates, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">{tCommon('searchNoResults')}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((tpl) => (
            <li
              key={tpl.id}
              className="flex items-center justify-between gap-1 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
            >
              <div className="flex-1 min-w-0 px-4 py-3">
                <p className="text-white text-sm font-medium truncate">{tpl.name}</p>
                <p className="text-gray-500 text-xs font-mono truncate">
                  {tpl.totalSlots}명 · {tpl.zoneHint}
                </p>
              </div>
              <DemoIconRow editLabel={t('editAction')} duplicateLabel={t('duplicateAction')} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DemoIconRow({ editLabel, duplicateLabel }: { editLabel: string; duplicateLabel: string }) {
  return (
    <>
      <button
        type="button"
        disabled
        aria-label={editLabel}
        className="flex items-center gap-1 px-3 py-2 text-amber-300/60 cursor-not-allowed text-xs font-medium"
      >
        <Pencil size={13} />
        <span className="hidden sm:inline">{editLabel}</span>
      </button>
      <button
        type="button"
        disabled
        aria-label={duplicateLabel}
        className="p-2 text-gray-400/60 cursor-not-allowed"
      >
        <Copy size={13} />
      </button>
      <div className="pr-2">
        <button
          type="button"
          disabled
          aria-label="delete"
          className="p-2 text-rose-400/60 cursor-not-allowed"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </>
  )
}
