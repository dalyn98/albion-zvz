'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Pencil } from 'lucide-react'
import DeleteTemplateButton from './DeleteTemplateButton'
import DuplicateTemplateButton from './DuplicateTemplateButton'
import SearchBox from './SearchBox'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { formatDate } from '@/lib/format-datetime'
import type { TemplateSummary } from '@/app/actions/templates'

export default function TemplateList({ templates }: { templates: TemplateSummary[] }) {
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
              <Link
                href={`/admin/dashboard/templates/${tpl.id}`}
                className="flex-1 min-w-0 px-4 py-3"
              >
                <p className="text-white text-sm font-medium truncate">{tpl.name}</p>
                <p className="text-gray-500 text-xs font-mono">{formatDate(tpl.created_at)}</p>
              </Link>
              <Link
                href={`/admin/dashboard/templates/${tpl.id}`}
                className="flex items-center gap-1 px-3 py-2 text-amber-300 hover:text-amber-200 hover:bg-gray-800 rounded-lg text-xs font-medium transition-colors"
                aria-label={t('editAction')}
              >
                <Pencil size={13} />
                <span className="hidden sm:inline">{t('editAction')}</span>
              </Link>
              <DuplicateTemplateButton id={tpl.id} />
              <div className="pr-2">
                <DeleteTemplateButton id={tpl.id} name={tpl.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
