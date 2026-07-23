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
import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { applyTemplateToSlotInput } from '@/lib/slot-template-shape'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { formatDate } from '@/lib/format-datetime'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import { CATEGORY_I18N_SLUG, EVENT_CATEGORIES, getRoleStyle, type EventCategory } from '@/types'
import type { SlotInput } from './SlotEditor'
import { useBodyScrollLock } from './useBodyScrollLock'

interface Props {
  slot: SlotInput
  onLoad: (next: SlotInput) => void
  timezone?: string
  // 편집 중인 이벤트 카테고리 — 전달되면 카테고리 필터가 초기값으로 세팅된다.
  // 관리자 템플릿 페이지처럼 이벤트 컨텍스트가 없는 곳에서는 생략.
  defaultCategoryFilter?: EventCategory
}

// Sentinel for the "no role" filter option — distinct from null so the
// select can round-trip empty-string values without ambiguity.
const ROLE_FILTER_ALL = '__all__'
const ROLE_FILTER_NONE = '__none__'
const CATEGORY_FILTER_ALL = '__all__'

export default function LoadSlotTemplateButton({
  slot,
  onLoad,
  timezone = DEFAULT_TENANT_TIMEZONE,
  defaultCategoryFilter,
}: Props) {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const tActionError = useTranslations('adminActionError')
  const [open, setOpen] = useState(false)
  useBodyScrollLock(open)
  const [templates, setTemplates] = useState<SlotTemplateSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [roleFilter, setRoleFilter] = useState<string>(ROLE_FILTER_ALL)
  const [categoryFilter, setCategoryFilter] = useState<string>(defaultCategoryFilter ?? CATEGORY_FILTER_ALL)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // 모달 열림 → 템플릿 fetch 시작. open prop 변화 → 비동기 외부 호출 트리거.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListLoading(true)
    setError('')
    listSlotTemplates()
      .then((result) => {
        if (cancelled) return
        if (result.error) setError(result.error)
        else setTemplates(result.templates)
      })
      .catch((error) => {
        if (cancelled) return
        setError(getServerActionClientErrorMessage(error, {
          expired: tActionError('serverActionExpired'),
          fallback: t('loadTemplatesFailed'),
        }))
      })
      .finally(() => {
        if (!cancelled) setListLoading(false)
      })
    return () => {
      cancelled = true
    }
    // t 는 fetch 결과 핸들러용 — 의존성 추가하면 t 변경마다 재 fetch 되므로 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const categoryFilteredTemplates = useMemo(() => {
    if (categoryFilter === CATEGORY_FILTER_ALL) return templates
    return templates.filter((tpl) => tpl.category === categoryFilter)
  }, [templates, categoryFilter])

  // Role options derived from the category-filtered set so switching categories
  // only surfaces roles that actually exist within the current bucket.
  const availableRoles = useMemo(() => {
    const set = new Set<string>()
    let hasUnroled = false
    for (const tpl of categoryFilteredTemplates) {
      if (tpl.role_name && tpl.role_name.trim().length > 0) set.add(tpl.role_name)
      else hasUnroled = true
    }
    return { roles: Array.from(set).sort(), hasUnroled }
  }, [categoryFilteredTemplates])

  const filteredTemplates = useMemo(() => {
    if (roleFilter === ROLE_FILTER_ALL) return categoryFilteredTemplates
    if (roleFilter === ROLE_FILTER_NONE) {
      return categoryFilteredTemplates.filter((tpl) => !tpl.role_name || tpl.role_name.trim().length === 0)
    }
    return categoryFilteredTemplates.filter((tpl) => tpl.role_name === roleFilter)
  }, [categoryFilteredTemplates, roleFilter])

  const apply = () => {
    if (!selected) return
    setError('')
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof getSlotTemplate>>
      try {
        result = await getSlotTemplate(selected)
      } catch (error) {
        setError(getServerActionClientErrorMessage(error, {
          expired: tActionError('serverActionExpired'),
          fallback: tActionError('serverError'),
        }))
        return
      }
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
      let result: Awaited<ReturnType<typeof deleteSlotTemplate>>
      try {
        result = await deleteSlotTemplate(id)
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
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900"
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
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-gray-400 text-[11px] font-semibold">
                      {t('slotTemplateCategoryFilter')}
                    </label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-sky-500"
                    >
                      <option value={CATEGORY_FILTER_ALL}>
                        {t('slotTemplateCategoryAll', { count: templates.length })}
                      </option>
                      {EVENT_CATEGORIES.map((c) => {
                        const count = templates.filter((tpl) => tpl.category === c).length
                        return (
                          <option key={c} value={c}>
                            {t(`slotTemplateCategory_${CATEGORY_I18N_SLUG[c]}`)} ({count})
                          </option>
                        )
                      })}
                    </select>
                  </div>
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
                        {t('slotTemplateRoleAll', { count: categoryFilteredTemplates.length })}
                      </option>
                      {availableRoles.roles.map((role) => {
                        const count = categoryFilteredTemplates.filter((tpl) => tpl.role_name === role).length
                        return (
                          <option key={role} value={role}>
                            {translateSlotRole(role, tRole)} ({count})
                          </option>
                        )
                      })}
                      {availableRoles.hasUnroled && (
                        <option value={ROLE_FILTER_NONE}>
                          {t('slotTemplateRoleNone', {
                            count: categoryFilteredTemplates.filter((tpl) => !tpl.role_name || tpl.role_name.trim().length === 0).length,
                          })}
                        </option>
                      )}
                    </select>
                  </div>
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
                            {translateSlotRole(tpl.role_name, tRole)}
                          </span>
                        )}
                        <span className="text-gray-500 text-[10px] font-mono flex-shrink-0">
                          {formatDate(tpl.created_at, timezone)}
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
