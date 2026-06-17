'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Save, X, AlertTriangle } from 'lucide-react'
import {
  saveSlotAsTemplate,
  listSlotTemplates,
  type SlotTemplateSummary,
} from '@/app/actions/slot-templates'
import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { slotInputToTemplateData } from '@/lib/slot-template-shape'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { formatDate } from '@/lib/format-datetime'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import { CATEGORY_I18N_SLUG, EVENT_CATEGORIES, getRoleStyle, type EventCategory } from '@/types'
import type { SlotInput } from './SlotEditor'

interface Props {
  slot: SlotInput
  defaultName: string
  timezone?: string
  // 편집 중인 이벤트 카테고리가 있다면 초기값으로 사용. 없으면 '전투' 기본.
  defaultCategory?: EventCategory
}

const MAX_NAME_LENGTH = 80

type Mode = 'new' | 'overwrite'

export default function SaveSlotAsTemplateButton({
  slot,
  defaultName,
  timezone = DEFAULT_TENANT_TIMEZONE,
  defaultCategory,
}: Props) {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const tActionError = useTranslations('adminActionError')
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('new')
  const [name, setName] = useState(defaultName)
  const [category, setCategory] = useState<EventCategory>(defaultCategory ?? '전투')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  // 덮어쓰기 모드용 상태. 모달이 열릴 때 lazy-load.
  const [templates, setTemplates] = useState<SlotTemplateSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [overwriteTarget, setOverwriteTarget] = useState<SlotTemplateSummary | null>(null)
  // 같은-이름 충돌 confirm 단계용. saveAsTemplateButton 의 conflictName 패턴과 동일.
  const [conflictName, setConflictName] = useState<string | null>(null)

  // 모달이 열릴 때 한 번만 fetch — 사용자가 덮어쓰기 탭으로 가지 않더라도 미리 받아두면
  // 탭 전환 시 깜빡임이 없다. listSlotTemplates 는 그룹/카테고리 필터 없이 전체 목록.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    // 모달 열림 → 템플릿 fetch 시작. open prop 변화 → 비동기 외부 호출 트리거.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListLoading(true)
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
    // t/tActionError 는 에러 표시용. 모달이 열린 상태의 입력/탭 렌더마다
    // 템플릿 목록이 다시 조회되지 않도록 open 에만 묶는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const closeModal = () => {
    setOpen(false)
    setConflictName(null)
    setOverwriteTarget(null)
  }

  const runSaveNew = (overwrite: boolean) => {
    setError('')
    startTransition(async () => {
      const data = slotInputToTemplateData(slot)
      let result: Awaited<ReturnType<typeof saveSlotAsTemplate>>
      try {
        result = await saveSlotAsTemplate(name, data, category, { overwrite })
      } catch (error) {
        setError(getServerActionClientErrorMessage(error, {
          expired: tActionError('serverActionExpired'),
          fallback: tActionError('serverError'),
        }))
        setConflictName(null)
        return
      }
      if (result.error) {
        setError(result.error)
        setConflictName(null)
        return
      }
      if (result.conflictName && !overwrite) {
        setConflictName(result.conflictName)
        return
      }
      setSaved(true)
      closeModal()
    })
  }

  const runSaveOverwriteById = (target: SlotTemplateSummary) => {
    setError('')
    startTransition(async () => {
      const data = slotInputToTemplateData(slot)
      let result: Awaited<ReturnType<typeof saveSlotAsTemplate>>
      try {
        result = await saveSlotAsTemplate('', data, '전투', { overwriteId: target.id })
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
      setSaved(true)
      closeModal()
    })
  }

  const submitNew = () => {
    if (!name.trim()) return
    runSaveNew(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMode('new')
          setName(defaultName)
          setCategory(defaultCategory ?? '전투')
          setError('')
          setSaved(false)
          setConflictName(null)
          setOverwriteTarget(null)
          setOpen(true)
        }}
        className="flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-md px-2 py-1 transition-colors"
        title={t('slotTemplateSaveTooltip')}
      >
        <Save size={11} />
        {t('slotTemplateSaveBtn')}
      </button>

      {saved && (
        <span className="text-[11px] text-emerald-400 ml-1 self-center">{tCommon('saved')}</span>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={() => !pending && closeModal()}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[88dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <h3 className="font-bold text-white text-base">{t('slotTemplateSaveTitle')}</h3>
              <button
                type="button"
                onClick={() => !pending && closeModal()}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex border-b border-gray-700 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMode('new')
                  setError('')
                }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  mode === 'new'
                    ? 'text-amber-300 border-amber-400'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {t('saveModeNew')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('overwrite')
                  setError('')
                }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  mode === 'overwrite'
                    ? 'text-amber-300 border-amber-400'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {t('saveModeOverwrite')}
              </button>
            </div>

            {mode === 'new' ? (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                  <p className="text-gray-400 text-xs">{t('slotTemplateSaveDescription')}</p>
                  <div>
                    <label className="text-gray-400 text-xs font-semibold block mb-1">{t('nameLabel')}</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('slotTemplatePlaceholder')}
                      maxLength={MAX_NAME_LENGTH}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs font-semibold block mb-1">
                      {t('slotTemplateCategoryLabel')}
                    </label>
                    <div className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-xs font-semibold">
                      {EVENT_CATEGORIES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCategory(c)}
                          className={`px-3 py-1 rounded-md transition-colors ${
                            category === c ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {t(`slotTemplateCategory_${CATEGORY_I18N_SLUG[c]}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                      <p className="text-red-400 text-xs">{error}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => !pending && closeModal()}
                    className="text-gray-400 hover:text-white text-sm px-3 py-2"
                    disabled={pending}
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={submitNew}
                    disabled={pending || !name.trim()}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
                  >
                    {pending ? t('savingDots') : tCommon('save')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
                {listLoading ? (
                  <p className="text-gray-500 text-xs text-center py-6">{tCommon('loadingDots')}</p>
                ) : templates.length === 0 ? (
                  <p className="text-gray-500 text-xs text-center py-6">{t('saveOverwriteListEmpty')}</p>
                ) : (
                  <>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      {t('slotTemplateSaveOverwriteListHint')}
                    </p>
                    {templates.map((tpl) => {
                      const roleStyle = getRoleStyle(tpl.role_name)
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => setOverwriteTarget(tpl)}
                          disabled={pending}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-amber-500/50 text-left transition-colors disabled:opacity-50"
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
                            {t('saveOverwriteByIdSavedAt', {
                              when: formatDate(tpl.created_at, timezone),
                            })}
                          </span>
                        </button>
                      )
                    })}
                  </>
                )}
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {conflictName && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
          onClick={() => !pending && setConflictName(null)}
        >
          <div
            className="bg-gray-900 border border-amber-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">{t('saveOverwriteTitle')}</h3>
                <p className="text-gray-300 text-xs leading-relaxed">
                  {t('slotTemplateOverwriteConfirm', { name: conflictName })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !pending && setConflictName(null)}
                disabled={pending}
                className="text-gray-400 hover:text-white text-sm px-3 py-2 disabled:opacity-40"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={() => runSaveNew(true)}
                disabled={pending}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('savingDots') : t('saveOverwriteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {overwriteTarget && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
          onClick={() => !pending && setOverwriteTarget(null)}
        >
          <div
            className="bg-gray-900 border border-amber-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">
                  {t('slotTemplateSaveOverwriteByIdConfirmTitle')}
                </h3>
                <p className="text-gray-300 text-xs leading-relaxed">
                  {t('slotTemplateSaveOverwriteByIdConfirmBody', { name: overwriteTarget.name })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !pending && setOverwriteTarget(null)}
                disabled={pending}
                className="text-gray-400 hover:text-white text-sm px-3 py-2 disabled:opacity-40"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={() => runSaveOverwriteById(overwriteTarget)}
                disabled={pending}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('savingDots') : t('saveOverwriteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
