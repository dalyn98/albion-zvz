'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Bell, Check, ChevronDown, Save, Search } from 'lucide-react'
import {
  listGuildChannels,
  listGuildRoles,
  type DiscordChannelOption,
  type DiscordRoleOption,
} from '@/app/actions/notifications'
import { updateAppSetting } from '@/app/actions/settings'
import {
  ADMIN_NOTIFICATION_TOPICS,
  type AdminNotificationTopic,
} from '@/lib/admin-notification-topics'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialEnabled: boolean
  initialChannelId: string
  initialRoleIds: string[]
  initialTopics: AdminNotificationTopic[]
  initialDigestMinutes: number
  embedded?: boolean
}

function sortedKey(values: Iterable<string>): string {
  return [...values].sort().join(',')
}

function isDigestValue(value: number): boolean {
  return value === 0 || value === 30 || value === 60 || value === 180 || value === 1440
}

export default function AdminNotificationSettingsForm({
  initialEnabled,
  initialChannelId,
  initialRoleIds,
  initialTopics,
  initialDigestMinutes,
  embedded = false,
}: Props) {
  const t = useTranslations('adminAdminNotifications')
  const router = useRouter()
  const roleBoxRef = useRef<HTMLDivElement>(null)
  const [channels, setChannels] = useState<DiscordChannelOption[] | null>(null)
  const [roles, setRoles] = useState<DiscordRoleOption[] | null>(null)
  const [channelLoadError, setChannelLoadError] = useState('')
  const [roleLoadError, setRoleLoadError] = useState('')
  const [enabled, setEnabled] = useState(initialEnabled)
  const [channelId, setChannelId] = useState(initialChannelId)
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set(initialRoleIds))
  const [topics, setTopics] = useState<Set<AdminNotificationTopic>>(new Set(initialTopics))
  const [digestMinutes, setDigestMinutes] = useState(
    isDigestValue(initialDigestMinutes) ? initialDigestMinutes : 0,
  )
  const [roleOpen, setRoleOpen] = useState(false)
  const [roleSearch, setRoleSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [channelResult, roleResult] = await Promise.allSettled([
        listGuildChannels(),
        listGuildRoles(),
      ])
      if (cancelled) return
      if (channelResult.status === 'fulfilled') {
        setChannelLoadError(channelResult.value.error ? t('channelLoadError') : '')
        setChannels(channelResult.value.channels)
      } else {
        setChannelLoadError(t('channelLoadError'))
        setChannels([])
      }
      if (roleResult.status === 'fulfilled') {
        setRoleLoadError(roleResult.value.error ? t('roleLoadError') : '')
        setRoles(roleResult.value.roles)
      } else {
        setRoleLoadError(t('roleLoadError'))
        setRoles([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!roleBoxRef.current?.contains(e.target as Node)) setRoleOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  const initialKey = [
    String(initialEnabled),
    initialChannelId,
    sortedKey(initialRoleIds),
    sortedKey(initialTopics),
    String(isDigestValue(initialDigestMinutes) ? initialDigestMinutes : 0),
  ].join('|')
  const currentKey = [
    String(enabled),
    channelId,
    sortedKey(roleIds),
    sortedKey(topics),
    String(digestMinutes),
  ].join('|')
  const dirty = (savedKey ?? initialKey) !== currentKey
  useReportDirty('admin-notification-settings', dirty)

  const filteredRoles = useMemo(() => {
    if (!roles) return []
    const q = roleSearch.trim().toLowerCase()
    if (!q) return roles
    return roles.filter((role) => role.name.toLowerCase().includes(q) || role.id.includes(q))
  }, [roles, roleSearch])

  const selectedRoles = useMemo(() => {
    if (!roles) return []
    return roles.filter((role) => roleIds.has(role.id))
  }, [roles, roleIds])
  const selectedChannelMissing =
    channels !== null && !!channelId && !channels.some((channel) => channel.id === channelId)

  const toggleRole = (id: string) => {
    setRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSaved(false)
  }

  const toggleTopic = (topic: AdminNotificationTopic) => {
    setTopics((prev) => {
      const next = new Set(prev)
      if (next.has(topic)) next.delete(topic)
      else next.add(topic)
      return next
    })
    setSaved(false)
  }

  const handleSave = async () => {
    if (enabled && !channelId) {
      setError(t('channelRequired'))
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)
    const updates: Array<[Parameters<typeof updateAppSetting>[0], string]> = [
      ['admin_notifications_enabled', enabled ? 'true' : 'false'],
      ['admin_notification_channel_id', channelId],
      ['admin_notification_role_ids', JSON.stringify([...roleIds])],
      ['admin_notification_topics', JSON.stringify([...topics])],
      ['admin_notification_digest_minutes', String(digestMinutes)],
    ]
    for (const [key, value] of updates) {
      const result = await updateAppSetting(key, value)
      if (result.error) {
        setError(result.error)
        setSaving(false)
        return
      }
    }
    setSavedKey(currentKey)
    setSaved(true)
    setSaving(false)
    router.refresh()
  }

  const containerClass = embedded
    ? 'space-y-4'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div>
        <h3 className={embedded ? 'font-semibold text-white text-sm' : 'font-bold text-white'}>
          {t('title')}
        </h3>
        <p className="text-gray-500 text-xs mt-1 leading-relaxed">{t('description')}</p>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-950/50 p-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked)
            setSaved(false)
          }}
          className="mt-1 h-4 w-4 accent-amber-500"
        />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <Bell size={14} className="text-amber-400" />
            {t('enabledLabel')}
          </span>
          <span className="mt-1 block text-xs text-gray-500">{t('enabledHint')}</span>
        </span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-400">{t('channelLabel')}</label>
          {channelLoadError ? (
            <>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={channelId}
                onChange={(e) => {
                  setChannelId(e.target.value.trim())
                  setSaved(false)
                }}
                disabled={saving}
                placeholder={t('channelIdPlaceholder')}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
              <p className="mt-1.5 text-xs text-red-400">{channelLoadError}</p>
              <p className="mt-1 text-xs text-gray-500">{t('channelManualHint')}</p>
            </>
          ) : (
            <>
              <select
                value={channelId}
                onChange={(e) => {
                  setChannelId(e.target.value)
                  setSaved(false)
                }}
                disabled={saving || channels === null}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">{t('channelNone')}</option>
                {selectedChannelMissing && (
                  <option value={channelId}>{t('channelUnknown', { id: channelId })}</option>
                )}
                {(channels ?? []).map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-gray-500">
                {channels === null ? t('channelsLoading') : t('channelHint')}
              </p>
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-400">{t('digestLabel')}</label>
          <select
            value={digestMinutes}
            onChange={(e) => {
              setDigestMinutes(Number(e.target.value))
              setSaved(false)
            }}
            disabled={saving}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
          >
            <option value={0}>{t('digestOff')}</option>
            <option value={30}>{t('digest30')}</option>
            <option value={60}>{t('digest60')}</option>
            <option value={180}>{t('digest180')}</option>
            <option value={1440}>{t('digestDaily')}</option>
          </select>
          <p className="mt-1.5 text-xs text-gray-500">{t('digestHint')}</p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-400">{t('roleLabel')}</label>
        {roleLoadError ? (
          <p className="text-xs text-red-400">{roleLoadError}</p>
        ) : roles === null ? (
          <p className="text-xs text-gray-500">{t('rolesLoading')}</p>
        ) : roles.length === 0 ? (
          <p className="text-xs text-gray-500">{t('rolesEmpty')}</p>
        ) : (
          <div ref={roleBoxRef} className="relative">
            <button
              type="button"
              onClick={() => setRoleOpen((v) => !v)}
              className="flex w-full items-start gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-left hover:border-gray-600 focus:border-amber-500 focus:outline-none"
              aria-expanded={roleOpen}
            >
              <div className="min-w-0 flex-1 py-0.5">
                {selectedRoles.length === 0 ? (
                  <span className="text-sm text-gray-500">{t('rolePlaceholder')}</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRoles.map((role) => (
                      <span
                        key={role.id}
                        className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs text-white"
                      >
                        {role.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <ChevronDown
                size={14}
                className={`mt-1 flex-shrink-0 text-gray-500 transition-transform ${roleOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {roleOpen && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-gray-700 bg-gray-950 shadow-xl">
                <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
                  <Search size={12} className="flex-shrink-0 text-gray-500" />
                  <input
                    type="text"
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    placeholder={t('roleSearchPlaceholder')}
                    className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
                  />
                  {selectedRoles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRoleIds(new Set())
                        setSaved(false)
                      }}
                      className="flex-shrink-0 text-[11px] text-gray-500 hover:text-red-400"
                    >
                      {t('clearSelection')}
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {filteredRoles.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-gray-500">{t('noMatches')}</p>
                  ) : (
                    filteredRoles.map((role) => {
                      const checked = roleIds.has(role.id)
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => toggleRole(role.id)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                            checked ? 'bg-amber-500/10' : 'hover:bg-gray-800'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                              checked ? 'border-amber-500 bg-amber-500' : 'border-gray-600'
                            }`}
                          >
                            {checked && <Check size={10} className="text-black" strokeWidth={3} />}
                          </span>
                          <span className="flex-1 truncate text-sm text-white">{role.name}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <p className="mt-1.5 text-xs text-gray-500">{t('roleHint')}</p>
      </div>

      <div>
        <p className="mb-2 text-xs text-gray-400">{t('topicsLabel')}</p>
        <div className="grid gap-2 md:grid-cols-2">
          {ADMIN_NOTIFICATION_TOPICS.map((topic) => (
            <label
              key={topic}
              className="flex items-start gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={topics.has(topic)}
                onChange={() => toggleTopic(topic)}
                className="mt-0.5 h-4 w-4 accent-amber-500"
              />
              <span>
                <span className="block text-sm text-white">{t(`topic.${topic}`)}</span>
                <span className="block text-xs text-gray-500">{t(`topicHint.${topic}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty || channels === null || roles === null}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500"
        >
          <Save size={14} />
          {saving ? t('saving') : t('save')}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{t('saved')}</span>}
      </div>
    </div>
  )
}
