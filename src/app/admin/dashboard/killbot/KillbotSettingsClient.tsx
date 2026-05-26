'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, CheckCircle2, Hash, Save, Send, Shield, XCircle } from 'lucide-react'
import {
  getKillbotAdminState,
  saveKillbotSettings,
  sendKillbotTest,
} from '@/app/actions/killbot-admin'
import { listGuildChannels, type DiscordChannelOption } from '@/app/actions/notifications'
import type { KillbotAdminState, KillbotDeliveryStatus } from '@/lib/killbot'

interface Props {
  initialState: KillbotAdminState
}

function formatDateTime(value: string | null): string {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt)
}

function statusClass(status: KillbotDeliveryStatus): string {
  if (status === 'sent') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-200'
  if (status === 'pending') return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
  return 'border-gray-600 bg-gray-800 text-gray-300'
}

export default function KillbotSettingsClient({ initialState }: Props) {
  const t = useTranslations('adminKillbotPage')
  const common = useTranslations('common')
  const [state, setState] = useState(initialState)
  const [channels, setChannels] = useState<DiscordChannelOption[]>([])
  const [channelError, setChannelError] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const config = state.config
  const [enabled, setEnabled] = useState(config.enabled)
  const [channelId, setChannelId] = useState(config.channelId ?? '')
  const [includeKills, setIncludeKills] = useState(config.includeKills)
  const [includeDeaths, setIncludeDeaths] = useState(config.includeDeaths)
  const [minFame, setMinFame] = useState(String(config.minFame))
  const [juicyFameThreshold, setJuicyFameThreshold] = useState(
    String(config.juicyFameThreshold),
  )

  useEffect(() => {
    let mounted = true
    listGuildChannels().then((result) => {
      if (!mounted) return
      setChannels(result.channels)
      setChannelError(result.error ?? '')
    })
    return () => {
      mounted = false
    }
  }, [])

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === channelId) ?? null,
    [channels, channelId],
  )

  const syncForm = (next: KillbotAdminState) => {
    setState(next)
    setEnabled(next.config.enabled)
    setChannelId(next.config.channelId ?? '')
    setIncludeKills(next.config.includeKills)
    setIncludeDeaths(next.config.includeDeaths)
    setMinFame(String(next.config.minFame))
    setJuicyFameThreshold(String(next.config.juicyFameThreshold))
  }

  const save = () => {
    setMessage('')
    startTransition(async () => {
      const result = await saveKillbotSettings({
        enabled,
        channelId: channelId || null,
        includeKills,
        includeDeaths,
        minFame: Number(minFame),
        juicyFameThreshold: Number(juicyFameThreshold),
      })
      if (result.error || !result.state) {
        setMessage(result.error ?? t('saveFailed'))
        return
      }
      syncForm(result.state)
      setMessage(t('saveSuccess'))
    })
  }

  const sendTest = () => {
    setMessage('')
    startTransition(async () => {
      const result = await sendKillbotTest()
      if (result.error) {
        setMessage(result.error)
        return
      }
      const refreshed = await getKillbotAdminState()
      if (refreshed.state) syncForm(refreshed.state)
      setMessage(t('testSuccess'))
    })
  }

  const targetReady = !!state.target.server && !!(state.target.homeGuildId || state.target.homeGuildName)
  const deliveryRows = state.deliveries

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {config.enabled ? (
              <CheckCircle2 size={15} className="text-emerald-300" />
            ) : (
              <XCircle size={15} className="text-gray-500" />
            )}
            {t('status')}
          </div>
          <p className="mt-2 text-lg font-semibold text-white">
            {config.enabled ? t('enabled') : t('disabled')}
          </p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Shield size={15} className="text-sky-300" />
            {t('homeGuild')}
          </div>
          <p className="mt-2 truncate text-lg font-semibold text-white">
            {state.target.homeGuildName || t('notConfigured')}
          </p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Hash size={15} className="text-violet-300" />
            {t('channel')}
          </div>
          <p className="mt-2 truncate text-lg font-semibold text-white">
            {selectedChannel?.name ?? (config.channelId ? `#${config.channelId}` : t('notConfigured'))}
          </p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
          <div className="text-xs text-gray-400">{t('lastPolled')}</div>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatDateTime(config.lastPolledAt) || t('notYet')}
          </p>
        </div>
      </div>

      {!targetReady && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-700/50 bg-amber-900/20 px-4 py-3 text-sm text-amber-100">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{t('missingAlbionConfig')}</p>
        </div>
      )}

      {channelError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-700/50 bg-red-900/25 px-4 py-3 text-sm text-red-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{channelError}</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('settingsTitle')}</h2>
            <p className="mt-1 text-sm text-gray-400">{t('settingsDescription')}</p>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-950/40 px-3 py-3">
            <span>
              <span className="block text-sm font-medium text-white">{t('enableLabel')}</span>
              <span className="block text-xs text-gray-500">{t('enableHelp')}</span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-5 w-5 accent-amber-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-200">{t('channelLabel')}</span>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
            >
              <option value="">{t('selectChannel')}</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-200">{t('minFameLabel')}</span>
              <input
                type="number"
                min={0}
                value={minFame}
                onChange={(e) => setMinFame(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-gray-200">{t('juicyLabel')}</span>
              <input
                type="number"
                min={0}
                value={juicyFameThreshold}
                onChange={(e) => setJuicyFameThreshold(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-950/40 px-3 py-3 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={includeKills}
                onChange={(e) => setIncludeKills(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              {t('includeKills')}
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-950/40 px-3 py-3 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={includeDeaths}
                onChange={(e) => setIncludeDeaths(e.target.checked)}
                className="h-4 w-4 accent-red-500"
              />
              {t('includeDeaths')}
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60"
            >
              <Save size={16} />
              {common(isPending ? 'saving' : 'save')}
            </button>
            <button
              type="button"
              onClick={sendTest}
              disabled={isPending || !config.channelId}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-100 hover:border-amber-400 disabled:opacity-50"
            >
              <Send size={16} />
              {t('sendTest')}
            </button>
            {message && <span className="text-sm text-gray-300">{message}</span>}
          </div>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('runtimeTitle')}</h2>
            <p className="mt-1 text-sm text-gray-400">{t('runtimeDescription')}</p>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">{t('server')}</dt>
              <dd className="font-medium text-gray-100">
                {state.target.server ?? t('notConfigured')}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">{t('lastSent')}</dt>
              <dd className="font-medium text-gray-100">
                {formatDateTime(config.lastSentAt) || t('notYet')}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">{t('lastError')}</dt>
              <dd className="max-w-[220px] truncate font-medium text-gray-100">
                {config.lastError || t('none')}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{t('recentTitle')}</h2>
          <span className="text-xs text-gray-500">
            {t('recentCount', { count: deliveryRows.length })}
          </span>
        </div>

        {deliveryRows.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-8 text-center text-sm text-gray-500">
            {t('emptyRecent')}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900/60">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-700 bg-gray-800/70 text-xs text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('colType')}</th>
                  <th className="px-3 py-2 font-medium">{t('colFame')}</th>
                  <th className="px-3 py-2 font-medium">{t('colStatus')}</th>
                  <th className="px-3 py-2 font-medium">{t('colCreated')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {deliveryRows.map((row) => (
                  <tr key={`${row.feedType}-${row.eventId}`} className="text-gray-200">
                    <td className="px-3 py-3 font-mono text-xs">
                      {row.feedType} #{row.eventId}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {row.fame.toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(row.status)}`}>
                        {t(`deliveryStatus.${row.status}`)}
                      </span>
                      {row.error && (
                        <p className="mt-1 max-w-xs truncate text-xs text-red-300">{row.error}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400">
                      {formatDateTime(row.createdAt) || t('notYet')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
