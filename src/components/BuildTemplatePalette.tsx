'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { FolderDown, Sparkles } from 'lucide-react'
import {
  listSlotTemplateCards,
  type SlotTemplateCard,
} from '@/app/actions/slot-templates'
import { applyTemplateToSlotInput } from '@/lib/slot-template-shape'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { CATEGORY_I18N_SLUG, EVENT_CATEGORIES, getRoleStyle, SLOT_KEYS, type EventCategory } from '@/types'
import type { SlotInput } from './SlotEditor'
import { emptySlotInput } from './SlotEditor'
import GearPreview from './GearPreview'
import { buildDisplaySlot } from './BuildPreview'

interface Props {
  selectedSlot: SlotInput | null
  selectedLabel: string | null
  onApply: (next: SlotInput) => void
  defaultCategoryFilter?: EventCategory
}

const ROLE_FILTER_ALL = '__all__'
const ROLE_FILTER_NONE = '__none__'
const CATEGORY_FILTER_ALL = '__all__'

export default function BuildTemplatePalette({
  selectedSlot,
  selectedLabel,
  onApply,
  defaultCategoryFilter,
}: Props) {
  const t = useTranslations('adminParty')
  const tTemplates = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const [templates, setTemplates] = useState<SlotTemplateCard[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [roleFilter, setRoleFilter] = useState(ROLE_FILTER_ALL)
  const [categoryFilter, setCategoryFilter] = useState<string>(defaultCategoryFilter ?? CATEGORY_FILTER_ALL)

  useEffect(() => {
    let cancelled = false
    // 렌더 직후 템플릿 목록 로드. 파티 편집기는 클라이언트 컴포넌트라 server action
    // 결과를 로컬 팔레트 상태로 보관한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    listSlotTemplateCards()
      .then((result) => {
        if (cancelled) return
        if (result.error) setError(result.error)
        else setTemplates(result.templates)
      })
      .catch(() => {
        if (!cancelled) setError(tTemplates('loadTemplatesFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // tTemplates 는 에러 표시용. 언어 변경마다 목록 재조회할 필요는 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categoryFiltered = useMemo(() => {
    if (categoryFilter === CATEGORY_FILTER_ALL) return templates
    return templates.filter((tpl) => tpl.category === categoryFilter)
  }, [templates, categoryFilter])

  const availableRoles = useMemo(() => {
    const roles = new Set<string>()
    let hasUnroled = false
    for (const tpl of categoryFiltered) {
      if (tpl.role_name?.trim()) roles.add(tpl.role_name)
      else hasUnroled = true
    }
    return { roles: Array.from(roles).sort(), hasUnroled }
  }, [categoryFiltered])

  const filtered = useMemo(() => {
    if (roleFilter === ROLE_FILTER_ALL) return categoryFiltered
    if (roleFilter === ROLE_FILTER_NONE) {
      return categoryFiltered.filter((tpl) => !tpl.role_name?.trim())
    }
    return categoryFiltered.filter((tpl) => tpl.role_name === roleFilter)
  }, [categoryFiltered, roleFilter])

  const apply = (template: SlotTemplateCard) => {
    if (!selectedSlot) return
    setPendingId(template.id)
    startTransition(() => {
      onApply(applyTemplateToSlotInput(selectedSlot, template.data))
      setPendingId(null)
    })
  }

  return (
    <aside className="rounded-xl border border-gray-700 bg-gray-900/60 p-3 space-y-3 h-fit xl:sticky xl:top-20">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Sparkles size={14} className="text-sky-300" />
            {t('templatePaletteTitle')}
          </h3>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{t('templatePaletteHint')}</p>
        </div>
        <span className="text-[10px] font-mono text-gray-500 bg-gray-950/70 border border-gray-800 rounded px-1.5 py-0.5">
          {templates.length}
        </span>
      </div>

      <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-2.5 py-2">
        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
          {t('templatePaletteSelectedLabel')}
        </p>
        <p className={selectedLabel ? 'text-xs text-sky-200 mt-0.5 font-semibold' : 'text-xs text-amber-300 mt-0.5'}>
          {selectedLabel ?? t('templatePaletteSelectSlot')}
        </p>
      </div>

      {templates.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
            aria-label={tTemplates('slotTemplateCategoryFilter')}
          >
            <option value={CATEGORY_FILTER_ALL}>
              {tTemplates('slotTemplateCategoryAll', { count: templates.length })}
            </option>
            {EVENT_CATEGORIES.map((category) => {
              const count = templates.filter((tpl) => tpl.category === category).length
              return (
                <option key={category} value={category}>
                  {tTemplates(`slotTemplateCategory_${CATEGORY_I18N_SLUG[category]}`)} ({count})
                </option>
              )
            })}
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
            aria-label={tTemplates('slotTemplateRoleFilter')}
          >
            <option value={ROLE_FILTER_ALL}>
              {tTemplates('slotTemplateRoleAll', { count: categoryFiltered.length })}
            </option>
            {availableRoles.roles.map((role) => {
              const count = categoryFiltered.filter((tpl) => tpl.role_name === role).length
              return (
                <option key={role} value={role}>
                  {translateSlotRole(role, tRole)} ({count})
                </option>
              )
            })}
            {availableRoles.hasUnroled && (
              <option value={ROLE_FILTER_NONE}>
                {tTemplates('slotTemplateRoleNone', {
                  count: categoryFiltered.filter((tpl) => !tpl.role_name?.trim()).length,
                })}
              </option>
            )}
          </select>
        </div>
      )}

      <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
        {loading ? (
          <p className="text-gray-500 text-xs text-center py-6">{tCommon('loadingDots')}</p>
        ) : templates.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-6">{t('templatePaletteEmpty')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-6">{t('templatePaletteFilteredEmpty')}</p>
        ) : (
          filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              disabled={!selectedSlot || isPending}
              pending={pendingId === template.id}
              onApply={() => apply(template)}
            />
          ))
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </aside>
  )
}

function TemplateCard({
  template,
  disabled,
  pending,
  onApply,
}: {
  template: SlotTemplateCard
  disabled: boolean
  pending: boolean
  onApply: () => void
}) {
  const t = useTranslations('adminParty')
  const tRole = useTranslations('slotRole')
  const previewSlot = useMemo(
    () => applyTemplateToSlotInput(emptySlotInput(1), template.data),
    [template.data],
  )
  const displaySlot = useMemo(() => buildDisplaySlot(previewSlot), [previewSlot])
  const roleStyle = getRoleStyle(template.role_name)

  return (
    <button
      type="button"
      onClick={onApply}
      disabled={disabled}
      className="w-full rounded-lg border border-gray-700 bg-gray-800/70 hover:bg-gray-800 hover:border-sky-500/50 disabled:opacity-50 disabled:hover:border-gray-700 text-left p-2 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{template.name}</p>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
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
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-300 bg-sky-500/10 rounded px-1.5 py-0.5">
          <FolderDown size={10} />
          {pending ? t('templatePaletteApplying') : t('templatePaletteApply')}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {SLOT_KEYS.slice(0, 6).map((key) => (
          <GearPreview key={key} slot={displaySlot} kind={key} size={30} isTaken={false} />
        ))}
      </div>
    </button>
  )
}
