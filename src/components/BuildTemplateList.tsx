'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteSlotTemplate, type SlotTemplateCard } from '@/app/actions/slot-templates'
import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { applyTemplateToSlotInput } from '@/lib/slot-template-shape'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { formatDate } from '@/lib/format-datetime'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { CATEGORY_I18N_SLUG, getRoleStyle, SLOT_KEYS } from '@/types'
import SearchBox from './SearchBox'
import GearPreview from './GearPreview'
import { emptySlotInput } from './SlotEditor'
import { buildDisplaySlot } from './BuildPreview'
import { useConfirm } from './ConfirmDialog'

interface Props {
  templates: SlotTemplateCard[]
  timezone?: string
}

export default function BuildTemplateList({ templates, timezone = DEFAULT_TENANT_TIMEZONE }: Props) {
  const t = useTranslations('adminBuildTemplates')
  const tTemplates = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const tActionError = useTranslations('adminActionError')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState(templates)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const askConfirm = useConfirm()

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return items
    return items.filter((tpl) => matchesName(tpl.name, q) || matchesName(tpl.role_name ?? '', q))
  }, [items, search])

  const remove = async (template: SlotTemplateCard) => {
    const ok = await askConfirm({
      body: t('deleteConfirm', { name: template.name }),
      destructive: true,
    })
    if (!ok) return
    setDeletingId(template.id)
    setError('')
    let result: Awaited<ReturnType<typeof deleteSlotTemplate>>
    try {
      result = await deleteSlotTemplate(template.id)
    } catch (error) {
      setDeletingId(null)
      setError(getServerActionClientErrorMessage(error, {
        expired: tActionError('serverActionExpired'),
        fallback: tActionError('serverError'),
      }))
      return
    }
    setDeletingId(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setItems((prev) => prev.filter((tpl) => tpl.id !== template.id))
  }

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          {items.length === 0 ? t('empty') : tCommon('searchNoResults')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtered.map((template) => {
            const slot = applyTemplateToSlotInput(emptySlotInput(1), template.data)
            const displaySlot = buildDisplaySlot(slot)
            const roleStyle = getRoleStyle(template.role_name)
            return (
              <li
                key={template.id}
                className="bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/admin/dashboard/builds/${template.id}`} className="min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{template.name}</p>
                    <p className="text-gray-500 text-xs font-mono mt-0.5">
                      {formatDate(template.created_at, timezone)}
                    </p>
                  </Link>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/admin/dashboard/builds/${template.id}`}
                      className="inline-flex items-center gap-1 px-2 py-1 text-amber-300 hover:text-amber-200 hover:bg-gray-800 rounded-lg text-xs font-medium transition-colors"
                      aria-label={t('editAction')}
                    >
                      <Pencil size={13} />
                      <span className="hidden sm:inline">{t('editAction')}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(template)}
                      disabled={deletingId === template.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-red-300 hover:text-red-200 hover:bg-gray-800 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      aria-label={t('deleteAction')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                    {tTemplates(`slotTemplateCategory_${CATEGORY_I18N_SLUG[template.category]}`)}
                  </span>
                  {template.role_name ? (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {translateSlotRole(template.role_name, tRole)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-500">{t('roleNone')}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {SLOT_KEYS.slice(0, 8).map((key) => (
                    <GearPreview key={key} slot={displaySlot} kind={key} size={34} isTaken={false} />
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
