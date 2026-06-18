'use client'

// CD 뱃지를 어떤 역할군의 슬롯에 노출할지 결정하는 관리자 설정.
// 저장값은 SlotRole 의 JSON 배열 문자열. 빈 배열 = 어떤 슬롯에도 뱃지 안 뜸.
// 이벤트 상세 페이지(`/events/[id]`)의 파티 그리드에서 참조한다.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Timer } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { SLOT_ROLES, SLOT_ROLE_STYLES, type SlotRole } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialRoles: SlotRole[]
  embedded?: boolean
}

export default function CdBadgeRolesForm({ initialRoles, embedded = false }: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const t = useTranslations('adminCdBadge')
  const [selected, setSelected] = useState<Set<SlotRole>>(new Set(initialRoles))
  // 저장 직후 saved 셋 sync — router.refresh 동안의 false-alarm 방지.
  const [savedSelected, setSavedSelected] = useState<Set<SlotRole>>(new Set(initialRoles))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const sortedSaved = [...savedSelected].sort().join(',')
  const sortedCurrent = [...selected].sort().join(',')
  const dirty = sortedSaved !== sortedCurrent
  useReportDirty('cd-badge-roles', dirty)

  const toggle = (role: SlotRole) => {
    const next = new Set(selected)
    if (next.has(role)) next.delete(role)
    else next.add(role)
    setSelected(next)
    setSaved(false)
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const payload = JSON.stringify([...selected])
    const result = await updateAppSetting('cd_badge_roles', payload)
    if (result.error) setError(result.error)
    else {
      setSavedSelected(new Set(selected))
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  const containerClass = embedded
    ? 'space-y-3'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2">
        {!embedded && <Timer size={16} className="text-cyan-400 mt-0.5" />}
        <div>
          {embedded ? (
            <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
          ) : (
            <h2 className="font-bold text-white">{t('title')}</h2>
          )}
          <p className="text-gray-500 text-xs mt-1">
            {t('descriptionLine1')}
            <br />
            {t('descriptionLine2')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SLOT_ROLES.map((role) => {
          const checked = selected.has(role)
          const style = SLOT_ROLE_STYLES[role]
          return (
            <label
              key={role}
              className={`flex items-center gap-2 cursor-pointer select-none rounded-lg border px-2.5 py-2 transition-colors ${
                checked
                  ? 'border-cyan-500/60 bg-cyan-500/10'
                  : 'border-gray-700 bg-gray-950/40 hover:border-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(role)}
                className="h-4 w-4 accent-cyan-500"
              />
              <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
              <span className="text-sm text-white">{translateSlotRole(role)}</span>
            </label>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? tc('saving') : tc('save')}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{tc('saved')}</span>}
      </div>
    </div>
  )
}
