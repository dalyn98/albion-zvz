'use client'

import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, ChevronDown, Check, Search } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { listGuildRoles, type DiscordRoleOption } from '@/app/actions/notifications'
import type { AppSettingKey } from '@/lib/app-settings'

type EventCreatorRolesKey =
  | 'event_creator_role_ids'
  | 'event_creator_role_ids_combat'
  | 'event_creator_role_ids_ff'
  | 'event_creator_role_ids_ganking'

interface Props {
  initialRoleIds: string[]
  settingKey?: EventCreatorRolesKey
  titleOverride?: string
  descriptionOverride?: string
  // 그룹 내부에서 렌더될 때 외곽 카드/리로그인 안내를 생략하고
  // sub-section 스타일로 좁게 표시한다. SettingsGroup 등 상위 카드가
  // title/reloginHint 를 한 번만 보여주므로 중복 제거 목적.
  embedded?: boolean
}

export default function EventCreatorRolesSetting({
  initialRoleIds,
  settingKey = 'event_creator_role_ids',
  titleOverride,
  descriptionOverride,
  embedded = false,
}: Props) {
  const t = useTranslations('adminEventCreatorRoles')
  const tActionErrors = useTranslations('errors')
  const router = useRouter()
  const [roles, setRoles] = useState<DiscordRoleOption[] | null>(null)
  const [rolesError, setRolesError] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialRoleIds))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      const res = await listGuildRoles()
      if (res.error) setRolesError(true)
      else setRoles(res.roles)
    })()
  }, [])

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    setSaved(false)
  }

  const clearAll = () => {
    setSelected(new Set())
    setSaved(false)
  }

  const sortedInitial = [...initialRoleIds].sort().join(',')
  const sortedCurrent = [...selected].sort().join(',')
  const dirty = sortedInitial !== sortedCurrent

  const filtered = useMemo(() => {
    if (!roles) return []
    const q = search.trim().toLowerCase()
    if (!q) return roles
    return roles.filter((r) => r.name.toLowerCase().includes(q) || r.id.includes(q))
  }, [roles, search])

  const selectedRoles = useMemo(() => {
    if (!roles) return []
    return roles.filter((r) => selected.has(r.id))
  }, [roles, selected])

  const handleSave = async () => {
                                   try {
      setLoading(true)
      setError('')
      setSaved(false)
      const ids = [...selected]
      const payload = JSON.stringify(ids)
      const result = await updateAppSetting(settingKey as AppSettingKey, payload)
      if (result.error) setError(result.error)
      else {
        setSaved(true)
        router.refresh()
      }
      setLoading(false)
                                   } catch (actionError) {
                                     setError(getServerActionClientErrorMessage(actionError, {
                                       expired: tActionErrors('actionExpired'),
                                       fallback: tActionErrors('actionFailed'),
                                     }))
                                   } finally {
                                     setLoading(false)
                                   }
                                 }

  const containerClass = embedded
    ? 'space-y-2'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div>
        {embedded ? (
          <h3 className="font-semibold text-white text-sm">{titleOverride ?? t('title')}</h3>
        ) : (
          <>
            <h2 className="font-bold text-white">{titleOverride ?? t('title')}</h2>
            <p className="text-gray-500 text-xs mt-1">{descriptionOverride ?? t('description')}</p>
            <p className="text-amber-400/80 text-xs mt-1">{t('reloginHint')}</p>
          </>
        )}
      </div>

      {rolesError && <p className="text-xs text-red-400">{t('rolesError')}</p>}
      {!rolesError && roles === null && <p className="text-xs text-gray-500">{t('rolesLoading')}</p>}
      {roles && roles.length === 0 && <p className="text-xs text-gray-500">{t('rolesEmpty')}</p>}

      {roles && roles.length > 0 && (
        <div className={embedded ? 'flex items-start gap-2' : ''}>
        <div ref={containerRef} className={embedded ? 'relative flex-1 min-w-0' : 'relative'}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-start gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-left hover:border-gray-600 focus:outline-none focus:border-amber-500"
            aria-expanded={open}
          >
            <div className="flex-1 min-w-0 py-0.5">
              {selectedRoles.length === 0 ? (
                <span className="text-sm text-gray-500">{t('placeholder')}</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedRoles.map((role) => (
                    <span
                      key={role.id}
                      className="inline-flex items-center bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 text-xs text-white"
                    >
                      {role.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <ChevronDown
              size={14}
              className={`text-gray-500 mt-1 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>

          {open && (
            <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-gray-950 border border-gray-700 rounded-lg shadow-xl">
              <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
                <Search size={12} className="text-gray-500 flex-shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none min-w-0"
                />
                {selectedRoles.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-[11px] text-gray-500 hover:text-red-400 flex-shrink-0"
                  >
                    {t('clearSelection')}
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {filtered.length === 0 ? (
                  <p className="text-xs text-gray-500 px-2 py-3 text-center">{t('noMatches')}</p>
                ) : (
                  filtered.map((role) => {
                    const checked = selected.has(role.id)
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggle(role.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                          checked ? 'bg-amber-500/10' : 'hover:bg-gray-800'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border flex-shrink-0 ${
                            checked ? 'bg-amber-500 border-amber-500' : 'border-gray-600'
                          }`}
                        >
                          {checked && <Check size={10} className="text-black" strokeWidth={3} />}
                        </span>
                        <span className="text-sm text-white flex-1 truncate">{role.name}</span>
                        <span className="text-[11px] text-gray-500 font-mono truncate flex-shrink-0">
                          {role.id}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
        {embedded && (
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !dirty || roles === null}
            className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-800 disabled:text-gray-600 text-black font-semibold px-3 py-2 rounded-lg transition-colors text-xs flex-shrink-0"
            aria-label={t('save')}
            title={loading ? t('saving') : t('save')}
          >
            <Save size={14} />
          </button>
        )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      {!embedded && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !dirty || roles === null}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            <Save size={14} />
            {loading ? t('saving') : t('save')}
          </button>
          {saved && !dirty && <span className="text-[11px] text-emerald-400">{t('saved')}</span>}
        </div>
      )}

      {embedded && saved && !dirty && (
        <p className="text-[11px] text-emerald-400">{t('saved')}</p>
      )}
    </div>
  )
}
