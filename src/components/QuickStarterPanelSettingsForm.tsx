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
import {
  QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH,
  QUICK_STARTER_PANEL_FOOTER_MAX_LENGTH,
  QUICK_STARTER_PANEL_TITLE_MAX_LENGTH,
} from '@/lib/discord-quick-starter-config'
import type { DiscordQuickStarterDestination } from '@/lib/discord-quick-starter-types'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialChannelId: string
  initialTitle: string
  initialDescription: string
  initialColor: string
  initialFooter: string
  defaultTitle: string
  defaultDescription: string
  defaultColor: string
  defaultFooter: string
  tenantName: string
  initialMessageId: string
  initialMessageChannelId: string
  initialPublishedAt: string
  initialMessageUrl: string
  availableDestinations: readonly DiscordQuickStarterDestination[]
}

const PREVIEW_BUTTONS = [
  ['events', '📅', 'previewEventsTitle', 'previewEventsDescription', 'bg-indigo-500'],
  ['wallet', '💱', 'previewExchangeTitle', 'previewExchangeDescription', 'bg-emerald-600'],
  ['regear', '🛡️', 'previewRegearTitle', 'previewRegearDescription', 'bg-gray-600'],
] as const

function replaceGuildName(template: string, tenantName: string): string {
  return template.replace(/\{name\}/g, tenantName)
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim())
}

function displayColor(value: string, fallback: string): string {
  return isHexColor(value) ? value.trim() : fallback
}

export default function QuickStarterPanelSettingsForm({
  initialChannelId,
  initialTitle,
  initialDescription,
  initialColor,
  initialFooter,
  defaultTitle,
  defaultDescription,
  defaultColor,
  defaultFooter,
  tenantName,
  initialMessageId,
  initialMessageChannelId,
  initialPublishedAt,
  initialMessageUrl,
  availableDestinations,
}: Props) {
  const t = useTranslations('adminQuickStarterPanel')
  const router = useRouter()
  const channelSelectId = useId()
  const titleId = useId()
  const descriptionId = useId()
  const colorId = useId()
  const footerId = useId()

  const [channels, setChannels] = useState<DiscordChannelOption[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [channelId, setChannelId] = useState(initialChannelId)
  const [savedChannelId, setSavedChannelId] = useState(initialChannelId)
  const [title, setTitle] = useState(initialTitle || defaultTitle)
  const [savedTitle, setSavedTitle] = useState(initialTitle || defaultTitle)
  const [description, setDescription] = useState(initialDescription || defaultDescription)
  const [savedDescription, setSavedDescription] = useState(initialDescription || defaultDescription)
  const [color, setColor] = useState(initialColor || defaultColor)
  const [savedColor, setSavedColor] = useState(initialColor || defaultColor)
  const [footer, setFooter] = useState(initialFooter)
  const [savedFooter, setSavedFooter] = useState(initialFooter)
  const [lastMessageId, setLastMessageId] = useState(initialMessageId)
  const [lastMessageChannelId, setLastMessageChannelId] = useState(initialMessageChannelId)
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt)
  const [messageUrl, setMessageUrl] = useState(initialMessageUrl)
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const dirty =
    channelId !== savedChannelId ||
    title !== savedTitle ||
    description !== savedDescription ||
    color !== savedColor ||
    footer !== savedFooter
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

  const previewTitle = useMemo(
    () => replaceGuildName(title.trim() || defaultTitle, tenantName),
    [defaultTitle, tenantName, title],
  )
  const previewDescription = useMemo(
    () => replaceGuildName(description.trim() || defaultDescription, tenantName),
    [defaultDescription, description, tenantName],
  )
  const previewFooter = useMemo(
    () => replaceGuildName(footer.trim(), tenantName),
    [footer, tenantName],
  )
  const previewColor = displayColor(color, defaultColor)
  const previewButtons = PREVIEW_BUTTONS.filter(([destination]) =>
    availableDestinations.includes(destination),
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
  const titleOverLimit = title.length > QUICK_STARTER_PANEL_TITLE_MAX_LENGTH
  const descriptionOverLimit = description.length > QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH
  const footerOverLimit = footer.length > QUICK_STARTER_PANEL_FOOTER_MAX_LENGTH
  const colorInvalid = !isHexColor(color)
  const hasValidationError =
    titleOverLimit || descriptionOverLimit || footerOverLimit || colorInvalid
  const canSubmit = !!channelId && !hasValidationError && busy === null

  const markSaved = () => {
    setSavedChannelId(channelId)
    setSavedTitle(title)
    setSavedDescription(description)
    setSavedColor(color)
    setSavedFooter(footer)
    router.refresh()
  }

  const panelInput = {
    channelId,
    title,
    description,
    color,
    footer,
  }

  const handleSave = async () => {
    setBusy('save')
    setError('')
    setStatus('')
    const result = await saveQuickStarterPanelDraft(panelInput)
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
    const result = await publishQuickStarterPanel(panelInput)
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

  const resetDefaults = () => {
    setTitle(defaultTitle)
    setDescription(defaultDescription)
    setColor(defaultColor)
    setFooter(defaultFooter)
    setStatus('')
  }

  const isAtDefault =
    title === defaultTitle &&
    description === defaultDescription &&
    color === defaultColor &&
    footer === defaultFooter

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
        <p className="text-gray-500 text-xs mt-1 leading-relaxed">{t('description')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
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
              <p className="text-xs text-gray-500 mt-1.5">
                {t('channelSelected', { channel: selectedChannelName })}
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1.5">{t('channelHint')}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <label htmlFor={titleId} className="text-gray-400 text-xs block">
                {t('embedTitleLabel')}
              </label>
              <span className={`text-[11px] ${titleOverLimit ? 'text-red-400' : 'text-gray-500'}`}>
                {title.length}/{QUICK_STARTER_PANEL_TITLE_MAX_LENGTH}
              </span>
            </div>
            <input
              id={titleId}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                setStatus('')
              }}
              disabled={busy !== null}
              placeholder={defaultTitle}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <label htmlFor={descriptionId} className="text-gray-400 text-xs block">
                {t('embedDescriptionLabel')}
              </label>
              <span className={`text-[11px] ${descriptionOverLimit ? 'text-red-400' : 'text-gray-500'}`}>
                {description.length}/{QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id={descriptionId}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value)
                setStatus('')
              }}
              rows={5}
              disabled={busy !== null}
              placeholder={defaultDescription}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 resize-y min-h-32"
            />
            <p className="text-xs text-gray-500 mt-1.5">{t('messageHint')}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div>
              <label htmlFor={colorId} className="text-gray-400 text-xs mb-1 block">
                {t('embedColorLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={previewColor}
                  onChange={(event) => {
                    setColor(event.target.value)
                    setStatus('')
                  }}
                  disabled={busy !== null}
                  className="h-10 w-11 rounded-md border border-gray-700 bg-gray-800 p-1 disabled:opacity-50"
                  aria-label={t('embedColorLabel')}
                />
                <input
                  id={colorId}
                  value={color}
                  onChange={(event) => {
                    setColor(event.target.value)
                    setStatus('')
                  }}
                  disabled={busy !== null}
                  placeholder={defaultColor}
                  className="min-w-0 flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
                />
              </div>
              {colorInvalid && (
                <p className="text-xs text-red-400 mt-1.5">{t('colorInvalid')}</p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <label htmlFor={footerId} className="text-gray-400 text-xs block">
                  {t('embedFooterLabel')}
                </label>
                <span className={`text-[11px] ${footerOverLimit ? 'text-red-400' : 'text-gray-500'}`}>
                  {footer.length}/{QUICK_STARTER_PANEL_FOOTER_MAX_LENGTH}
                </span>
              </div>
              <input
                id={footerId}
                value={footer}
                onChange={(event) => {
                  setFooter(event.target.value)
                  setStatus('')
                }}
                disabled={busy !== null}
                placeholder={t('embedFooterPlaceholder')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
              />
            </div>
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
              onClick={resetDefaults}
              disabled={busy !== null || isAtDefault}
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
            <div className="overflow-hidden rounded-xl bg-[#2b2d31] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
              <div className="flex">
                <div className="w-1 shrink-0" style={{ backgroundColor: previewColor }} />
                <div className="min-w-0 flex-1 px-4 py-3.5">
                  <p className="text-balance text-sm font-semibold text-white break-words">{previewTitle}</p>
                  <p className="text-pretty text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed mt-1">
                    {previewDescription}
                  </p>
                  <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
                    {previewButtons.map(([destination, emoji, titleKey, descriptionKey, buttonColor]) => (
                      <div
                        key={destination}
                        className="flex min-h-16 items-center gap-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white">
                            {emoji} {t(titleKey)}
                          </p>
                          <p className="mt-0.5 text-pretty text-xs leading-relaxed text-gray-400">
                            {t(descriptionKey)}
                          </p>
                        </div>
                        <div
                          className={`flex min-h-10 shrink-0 items-center rounded-md px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-transform active:scale-[0.96] ${buttonColor}`}
                        >
                          {t(titleKey)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-gray-700 px-3 text-xs font-semibold text-gray-100 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-transform active:scale-[0.96]">
                    <span>🔐</span>
                    <span className="truncate">{t('previewLogin')}</span>
                  </div>
                  {previewFooter && (
                    <p className="mt-3 text-pretty text-[11px] text-gray-400 break-words">{previewFooter}</p>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
              {t('featureButtonsHint')}
            </p>
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
