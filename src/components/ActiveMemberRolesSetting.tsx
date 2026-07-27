'use client'

import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, ChevronDown, Check, Search, RefreshCw } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { listGuildRoles, type DiscordRoleOption } from '@/app/actions/notifications'
import { syncMembersNow, type SyncMembersNowResult } from '@/app/actions/members-admin'
import { formatDateTime } from '@/lib/format-datetime'

interface Props {
  initialRoleIds: string[]
  initialLastSyncAt: string | null
  timezone: string
  embedded?: boolean
}

export default function ActiveMemberRolesSetting({
  initialRoleIds,
  initialLastSyncAt,
  timezone,
  embedded = false,
}: Props) {
  const t = useTranslations('adminActiveMemberRoles')
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
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncMembersNowResult | null>(null)
  const [syncError, setSyncError] = useState('')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(initialLastSyncAt)
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
      const result = await updateAppSetting('active_member_role_ids', payload)
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

  const handleSyncNow = async () => {
    setSyncing(true)
    setSyncError('')
    setSyncResult(null)
    const result = await syncMembersNow()
    if (result.error) {
      setSyncError(result.error)
    } else {
      setSyncResult(result)
      setLastSyncAt(new Date().toISOString())
      router.refresh()
    }
    setSyncing(false)
  }

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncAt) return t('neverSynced')
    return t('lastSyncAt', { time: formatDateTime(lastSyncAt, timezone) })
  }, [lastSyncAt, t, timezone])

  const containerClass = embedded
    ? 'space-y-3'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div>
        {embedded ? (
          <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
        ) : (
          <h2 className="font-bold text-white">{t('title')}</h2>
        )}
        <p className="text-gray-500 text-xs mt-1">{t('description')}</p>
        <p className="text-amber-400/80 text-xs mt-1">{t('cronHint')}</p>
      </div>

      {rolesError && <p className="text-xs text-red-400">{t('rolesError')}</p>}
      {!rolesError && roles === null && <p className="text-xs text-gray-500">{t('rolesLoading')}</p>}
      {roles && roles.length === 0 && <p className="text-xs text-gray-500">{t('rolesEmpty')}</p>}

      {roles && roles.length > 0 && (
        <div ref={containerRef} className="relative">
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
            <div className="absolute z-30 top-full mt-1 w-full bg-gray-950 border border-gray-700 rounded-lg shadow-xl">
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
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

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

      <div className="pt-4 border-t border-gray-800 space-y-3">
        <div>
          <h3 className="font-semibold text-white text-sm">{t('syncTitle')}</h3>
          <p className="text-gray-500 text-xs mt-1">{t('syncDescription')}</p>
          <p className="text-gray-600 text-[11px] mt-1">{lastSyncLabel}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 text-white border border-gray-700 px-4 py-2 rounded-lg transition-colors text-sm"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? t('syncing') : t('syncNow')}
          </button>
          {syncResult && (
            <span className="text-[11px] text-emerald-400">
              {t('syncSuccess', {
                scanned: syncResult.scanned,
                discordMembers: syncResult.discordMembers,
                withdrawn: syncResult.withdrawn,
                rejoined: syncResult.rejoined,
              })}
            </span>
          )}
        </div>

        {syncError && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
            {t('syncError', { error: syncError })}
          </div>
        )}
      </div>
    </div>
  )
}
