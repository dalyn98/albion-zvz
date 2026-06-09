'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ExternalLink, RotateCcw, Save, Send } from 'lucide-react'
import {
  listGuildChannels,
  type DiscordChannelOption,
} from '@/app/actions/notifications'
import {
  publishQuickStarterPanel,
  saveQuickStarterPanelDraft,
} from '@/app/actions/discord-quick-starter-panel'
import { QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH } from '@/lib/discord-quick-starter-config'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialChannelId: string
  initialMessage: string
  defaultMessage: string
  tenantName: string
  initialMessageId: string
  initialMessageChannelId: string
  initialPublishedAt: string
  initialMessageUrl: string
}

const PREVIEW_BUTTONS = [
  ['✅', 'Verify'],
  ['📅', 'Events'],
  ['👤', 'My Page'],
  ['📘', 'Guide'],
  ['🛡️', 'Regear'],
  ['🛒', 'Shop'],
  ['💰', 'Wallet'],
  ['🔨', 'Craft'],
] as const

export default function QuickStarterPanelSettingsForm({
  initialChannelId,
  initialMessage,
  defaultMessage,
  tenantName,
  initialMessageId,
  initialMessageChannelId,
  initialPublishedAt,
  initialMessageUrl,
}: Props) {
  const t = useTranslations('adminQuickStarterPanel')
  const router = useRouter()
  const channelSelectId = useId()
  const messageId = useId()

  const [channels, setChannels] = useState<DiscordChannelOption[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [channelId, setChannelId] = useState(initialChannelId)
  const [savedChannelId, setSavedChannelId] = useState(initialChannelId)
  const [message, setMessage] = useState(initialMessage || defaultMessage)
  const [savedMessage, setSavedMessage] = useState(initialMessage || defaultMessage)
  const [lastMessageId, setLastMessageId] = useState(initialMessageId)
  const [lastMessageChannelId, setLastMessageChannelId] = useState(initialMessageChannelId)
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt)
  const [messageUrl, setMessageUrl] = useState(initialMessageUrl)
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const dirty = channelId !== savedChannelId || message !== savedMessage
  useReportDirty('quick-starter-panel', dirty)

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

  const previewMessage = useMemo(
    () => (message.trim() || defaultMessage).replace(/\{name\}/g, tenantName),
    [defaultMessage, message, tenantName],
  )
  const selectedChannelName = useMemo(() => {
    const channel = channels?.find((candidate) => candidate.id === channelId)
    return channel ? `#${channel.name}` : channelId ? t('savedChannelFallback', { id: channelId }) : ''
  }, [channelId, channels, t])
  const lastChannelName = useMemo(() => {
    const channel = channels?.find((candidate) => candidate.id === lastMessageChannelId)
    return channel
      ? `#${channel.name}`
      : lastMessageChannelId
        ? t('savedChannelFallback', { id: lastMessageChannelId })
        : ''
  }, [channels, lastMessageChannelId, t])
  const willUpdateExisting = !!lastMessageId && lastMessageChannelId === channelId
  const overLimit = message.length > QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH
  const canSubmit = !!channelId && !overLimit && busy === null

  const markSaved = () => {
    setSavedChannelId(channelId)
    setSavedMessage(message)
    router.refresh()
  }

  const handleSave = async () => {
    setBusy('save')
    setError('')
    setStatus('')
    const result = await saveQuickStarterPanelDraft({ channelId, message })
    if (result.error) {
      setError(result.error)
      setBusy(null)
      return
    }
    markSaved()
    setStatus(t('savedDraft'))
    setBusy(null)
  }

  const handlePublish = async () => {
    setBusy('publish')
    setError('')
    setStatus('')
    const result = await publishQuickStarterPanel({ channelId, message })
    if (result.error || !result.messageId || !result.channelId || !result.messageUrl) {
      setError(result.error || t('publishFailed'))
      setBusy(null)
      return
    }
    markSaved()
    setLastMessageId(result.messageId)
    setLastMessageChannelId(result.channelId)
    setPublishedAt(new Date().toISOString())
    setMessageUrl(result.messageUrl)
    setStatus(willUpdateExisting ? t('updated') : t('published'))
    setBusy(null)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
        <p className="text-gray-500 text-xs mt-1 leading-relaxed">{t('description')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-3">
          <div>
            <label htmlFor={channelSelectId} className="text-gray-400 text-xs mb-1 block">
              {t('channelLabel')}
            </label>
            <select
              id={channelSelectId}
              value={channelId}
              onChange={(event) => {
                setChannelId(event.target.value)
                setStatus('')
              }}
              disabled={busy !== null || channels === null}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
            >
              <option value="">{t('channelNone')}</option>
              {(channels ?? []).map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </select>
            {loadError ? (
              <p className="text-xs text-red-400 mt-1.5">{t('channelLoadError')}</p>
            ) : channels === null ? (
              <p className="text-xs text-gray-500 mt-1.5">{t('channelsLoading')}</p>
            ) : selectedChannelName ? (
              <p className="text-xs text-gray-500 mt-1.5">{t('channelSelected', { channel: selectedChannelName })}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1.5">{t('channelHint')}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <label htmlFor={messageId} className="text-gray-400 text-xs block">
                {t('messageLabel')}
              </label>
              <span className={`text-[11px] ${overLimit ? 'text-red-400' : 'text-gray-500'}`}>
                {message.length}/{QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id={messageId}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value)
                setStatus('')
              }}
              rows={5}
              disabled={busy !== null}
              placeholder={defaultMessage}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 resize-y min-h-32"
            />
            <p className="text-xs text-gray-500 mt-1.5">{t('messageHint')}</p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
              {error}
            </div>
          )}
          {status && !error && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 text-emerald-300 text-xs">
              {status}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSubmit || !dirty}
              className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 text-white border border-gray-700 font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <Save size={14} />
              {busy === 'save' ? t('saving') : t('saveDraft')}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <Send size={14} />
              {busy === 'publish'
                ? t('publishing')
                : willUpdateExisting
                  ? t('updatePanel')
                  : t('publishPanel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMessage(defaultMessage)
                setStatus('')
              }}
              disabled={busy !== null || message === defaultMessage}
              className="inline-flex items-center gap-2 text-gray-300 hover:text-white disabled:text-gray-600 px-3 py-2 rounded-lg text-sm"
            >
              <RotateCcw size={14} />
              {t('resetDefault')}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="border border-gray-700 rounded-lg bg-gray-950 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-300">{t('previewTitle')}</span>
              <span className="text-[11px] text-gray-500">{t('discordPreview')}</span>
            </div>
            <p className="text-sm text-gray-100 whitespace-pre-wrap break-words leading-relaxed">
              {previewMessage}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {PREVIEW_BUTTONS.map(([emoji, label]) => (
                <div
                  key={label}
                  className="h-9 rounded-md border border-gray-700 bg-gray-800 px-2 flex items-center justify-center gap-1.5 text-xs text-gray-100"
                >
                  <span>{emoji}</span>
                  <span className="truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 space-y-1.5">
            {lastMessageId ? (
              <>
                <p>
                  <span className="text-gray-400">{t('lastPublished')}</span>{' '}
                  {lastChannelName || t('unknownChannel')}
                </p>
                {publishedAt && (
                  <p>
                    <span className="text-gray-400">{t('publishedAt')}</span>{' '}
                    {new Date(publishedAt).toLocaleString()}
                  </p>
                )}
                {messageUrl && (
                  <Link
                    href={messageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200"
                  >
                    <ExternalLink size={12} />
                    {t('openDiscordMessage')}
                  </Link>
                )}
              </>
            ) : (
              <p>{t('notPublished')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
