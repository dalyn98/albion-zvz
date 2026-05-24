'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save } from 'lucide-react'
import {
  listGuildChannels,
  type DiscordChannelOption,
} from '@/app/actions/notifications'
import { updateTenantEventChannel } from '@/app/actions/settings'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialChannelId: string
  embedded?: boolean
}

export default function EventChannelSetting({
  initialChannelId,
  embedded = false,
}: Props) {
  const t = useTranslations('adminSettings')
  const router = useRouter()
  const selectId = useId()
  const [channels, setChannels] = useState<DiscordChannelOption[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [channelId, setChannelId] = useState(initialChannelId)
  const [savedChannelId, setSavedChannelId] = useState(initialChannelId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = channelId !== savedChannelId
  useReportDirty('event-channel-setting', dirty)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await listGuildChannels()
      if (cancelled) return
      if (result.error) {
        setLoadError(true)
        setChannels([])
        return
      }
      setChannels(result.channels)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    const result = await updateTenantEventChannel(channelId)
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    setSavedChannelId(channelId)
    setSaved(true)
    router.refresh()
    setSaving(false)
  }

  const containerClass = embedded
    ? 'space-y-3'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div>
        {embedded ? (
          <h3 className="font-semibold text-white text-sm">{t('eventChannelTitle')}</h3>
        ) : (
          <h2 className="font-bold text-white">{t('eventChannelTitle')}</h2>
        )}
        <p className="text-gray-500 text-xs mt-1 leading-relaxed">
          {t('eventChannelDescription')}
        </p>
      </div>

      <div>
        <label htmlFor={selectId} className="text-gray-400 text-xs mb-1 block">
          {t('eventChannelLabel')}
        </label>
        <select
          id={selectId}
          value={channelId}
          onChange={(e) => {
            setChannelId(e.target.value)
            setSaved(false)
          }}
          disabled={saving || channels === null}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
        >
          <option value="">{t('eventChannelNone')}</option>
          {(channels ?? []).map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
            </option>
          ))}
        </select>
        {loadError ? (
          <p className="text-xs text-red-400 mt-1.5">{t('eventChannelLoadError')}</p>
        ) : channels === null ? (
          <p className="text-xs text-gray-500 mt-1.5">{t('eventChannelLoading')}</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1.5">{t('eventChannelHint')}</p>
        )}
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
          disabled={saving || !dirty}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {saving ? t('saving') : t('save')}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{t('saved')}</span>}
      </div>
    </div>
  )
}
