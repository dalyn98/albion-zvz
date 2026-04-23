'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { FolderDown, Trash2, X } from 'lucide-react'
import {
  deleteSlotTemplate,
  getSlotTemplate,
  listSlotTemplates,
  type SlotTemplateSummary,
} from '@/app/actions/slot-templates'
import { applyTemplateToSlotInput } from '@/lib/slot-template-shape'
import { formatDate } from '@/lib/format-datetime'
import { getRoleStyle } from '@/types'
import type { SlotInput } from './SlotEditor'

interface Props {
  slot: SlotInput
  onLoad: (next: SlotInput) => void
}

// Sentinel for the "no role" filter option — distinct from null so the
// select can round-trip empty-string values without ambiguity.
const ROLE_FILTER_ALL = '__all__'
const ROLE_FILTER_NONE = '__none__'

export default function LoadSlotTemplateButton({ slot, onLoad }: Props) {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<SlotTemplateSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [roleFilter, setRoleFilter] = useState<string>(ROLE_FILTER_ALL)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setListLoading(true)
    setError('')
    listSlotTemplates()
      .then((result) => {
        if (cancelled) return
        if (result.error) setError(result.error)
        else setTemplates(result.templates)
      })
      .finally(() => {
        if (!cancelled) setListLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Role options derived from the loaded templates — only surface roles that
  // actually exist so the dropdown doesn't advertise empty filter buckets.
  const availableRoles = useMemo(() => {
    const set = new Set<string>()
    let hasUnroled = false
    for (const tpl of templates) {
      if (tpl.role_name && tpl.role_name.trim().length > 0) set.add(tpl.role_name)
      else hasUnroled = true
    }
    return { roles: Array.from(set).sort(), hasUnroled }
  }, [templates])

  const filteredTemplates = useMemo(() => {
    if (roleFilter === ROLE_FILTER_ALL) return templates
    if (roleFilter === ROLE_FILTER_NONE) {
      return templates.filter((tpl) => !tpl.role_name || tpl.role_name.trim().length === 0)
    }
    return templates.filter((tpl) => tpl.role_name === roleFilter)
  }, [templates, roleFilter])

  const apply = () => {
    if (!selected) return
    setError('')
    startTransition(async () => {
      const result = await getSlotTemplate(selected)
      if (result.error || !result.template) {
        setError(result.error ?? t('slotTemplateNotFound'))
        return
      }
      const next = applyTemplateToSlotInput(slot, result.template.data)
      onLoad(next)
      setOpen(false)
    })
  }

  const remove = (id: string) => {
    setError('')
    startTransition(async () => {
      const result = await deleteSlotTemplate(id)
      if (result.error) {
        setError(result.error)
        return
      }
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== id))
      if (selected === id) setSelected(null)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelected(null)
          setError('')
          setOpen(true)
        }}
        className="flex items-center gap-1 text-[11px] font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-md px-2 py-1 transition-colors"
        title={t('slotTemplateLoadTooltip')}
      >
        <FolderDown size={11} />
        {t('slotTemplateLoadBtn')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[80dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <h3 className="font-bold text-white text-base">{t('slotTemplateLoadTitle')}</h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {!listLoading && templates.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-gray-400 text-[11px] font-semibold">
                    {t('slotTemplateRoleFilter')}
                  </label>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value={ROLE_FILTER_ALL}>
                      {t('slotTemplateRoleAll', { count: templates.length })}
                    </option>
                    {availableRoles.roles.map((role) => {
                      const count = templates.filter((tpl) => tpl.role_name === role).length
                      return (
                        <option key={role} value={role}>
                          {role} ({count})
                        </option>
                      )
                    })}
                    {availableRoles.hasUnroled && (
                      <option value={ROLE_FILTER_NONE}>
                        {t('slotTemplateRoleNone', {
                          count: templates.filter((tpl) => !tpl.role_name || tpl.role_name.trim().length === 0).length,
                        })}
                      </option>
                    )}
                  </select>
                </div>
              )}
              {listLoading ? (
                <p className="text-gray-500 text-xs text-center py-4">{tCommon('loadingDots')}</p>
              ) : templates.length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-4">
                  {t('slotTemplateNoData')}
                </p>
              ) : filteredTemplates.length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-4">
                  {t('slotTemplateNoDataFiltered')}
                </p>
              ) : (
                filteredTemplates.map((tpl) => {
                  const roleStyle = getRoleStyle(tpl.role_name)
                  return (
                    <div
                      key={tpl.id}
                      className={`flex items-center gap-1 rounded-lg border transition-colors ${
                        selected === tpl.id
                          ? 'bg-sky-500/20 border-sky-500/50'
                          : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(tpl.id)}
                        className="flex-1 flex items-center gap-2 px-3 py-2 text-left min-w-0"
                      >
                        <span className="text-white text-sm truncate flex-1 min-w-0">{tpl.name}</span>
                        {tpl.role_name && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                              roleStyle ? roleStyle.badge : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {tpl.role_name}
                          </span>
                        )}
                        <span className="text-gray-500 text-[10px] font-mono flex-shrink-0">
                          {formatDate(tpl.created_at)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(tpl.id)}
                        disabled={pending}
                        className="p-2 text-gray-500 hover:text-red-400 flex-shrink-0 disabled:opacity-50"
                        aria-label={t('slotTemplateDeleteAria', { name: tpl.name })}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })
              )}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-700 flex-shrink-0">
              <p className="text-gray-500 text-[11px]">{t('slotTemplateOverwriteWarn')}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => !pending && setOpen(false)}
                  className="text-gray-400 hover:text-white text-sm px-3 py-2"
                  disabled={pending}
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={pending || !selected}
                  className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
                >
                  {pending ? t('applying') : t('apply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
