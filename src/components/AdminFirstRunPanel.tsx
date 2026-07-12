'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  BookOpen,
  CalendarPlus,
  Check,
  Clipboard,
  Loader2,
  MessageCircle,
  Send,
  Settings,
  UserPlus,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  embedded?: boolean
  inviteUrl: string | null
  guildName: string
  canSendDiscordTest: boolean
  newEventHref: string
  guideHref: string
  settingsHref: string
}

type CopyTarget = 'invite' | 'message'

interface TestAnnouncementResponse {
  ok?: boolean
  code?: string
  retryAfterSeconds?: number
}

const TEST_ERROR_KEYS: Record<string, string> = {
  unauthorized: 'testErrorUnauthorized',
  forbidden_origin: 'testErrorForbiddenOrigin',
  tenant_missing: 'testErrorTenantMissing',
  bot_missing: 'testErrorBotMissing',
  channel_missing: 'testErrorChannelMissing',
  rate_limited: 'testErrorRateLimited',
  missing_access: 'testErrorMissingAccess',
  missing_permissions: 'testErrorMissingPermissions',
  unknown_channel: 'testErrorUnknownChannel',
  forbidden: 'testErrorForbidden',
  server_error: 'testErrorGeneric',
}

export default function AdminFirstRunPanel({
  embedded = false,
  inviteUrl,
  guildName,
  canSendDiscordTest,
  newEventHref,
  guideHref,
  settingsHref,
}: Props) {
  const t = useTranslations('adminFirstRun')
  const [copied, setCopied] = useState<CopyTarget | null>(null)
  const [copyError, setCopyError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [testMessage, setTestMessage] = useState('')
  const [isTestError, setIsTestError] = useState(false)
  const messageTemplate = inviteUrl
    ? t('inviteMessageTemplate', { guildName, inviteUrl })
    : ''

  useEffect(() => {
    if (!copied) return
    const timeoutId = window.setTimeout(() => setCopied(null), 1500)
    return () => window.clearTimeout(timeoutId)
  }, [copied])

  async function recordInviteCopied() {
    try {
      await fetch('/api/admin/onboarding/track', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ eventType: 'member_invite_copied' }),
      })
    } catch {
      // Telemetry must never interrupt the copy flow.
    }
  }

  async function copyToClipboard(target: CopyTarget, value: string) {
    setCopyError('')
    try {
      await navigator.clipboard.writeText(value)
      setCopied(target)
      if (target === 'invite') void recordInviteCopied()
    } catch {
      setCopyError(t('copyFailed'))
    }
  }

  async function sendTestAnnouncement() {
    setIsSending(true)
    setIsTestError(false)
    setTestMessage('')
    try {
      const response = await fetch('/api/admin/onboarding/test-announcement', {
        method: 'POST',
        headers: { accept: 'application/json' },
      })
      const payload = (await response.json().catch(() => null)) as TestAnnouncementResponse | null
      if (response.ok && payload?.ok) {
        setTestMessage(t('testSuccess'))
        return
      }
      const code = payload?.code ?? 'server_error'
      const key = TEST_ERROR_KEYS[code] ?? 'testErrorGeneric'
      setIsTestError(true)
      setTestMessage(
        key === 'testErrorRateLimited'
          ? t(key, { seconds: payload?.retryAfterSeconds ?? 30 })
          : t(key),
      )
    } catch {
      setIsTestError(true)
      setTestMessage(t('testErrorNetwork'))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section
      className={
        embedded
          ? 'border-t border-border pt-4 space-y-4'
          : 'rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-card space-y-4'
      }
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-soft-foreground">
          {t('eyebrow')}
        </p>
        {embedded ? (
          <h3 className="text-lg font-semibold text-foreground">{t('title')}</h3>
        ) : (
          <h2 className="text-xl font-semibold text-foreground">{t('title')}</h2>
        )}
        <p className="text-sm text-muted leading-relaxed max-w-3xl">{t('description')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <button
          type="button"
          disabled={!inviteUrl}
          onClick={() => inviteUrl && copyToClipboard('invite', inviteUrl)}
          className="group min-h-36 rounded-lg border border-emerald-400/25 bg-emerald-500/5 p-4 text-left transition-colors hover:border-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex items-start justify-between gap-3">
            <UserPlus size={19} className="text-emerald-300 flex-shrink-0" />
            {copied === 'invite' ? <Check size={16} className="text-emerald-200" /> : null}
          </div>
          <h3 className="mt-3 text-sm font-semibold text-emerald-100">
            {t('inviteActionTitle')}
          </h3>
          <p className="mt-1 text-xs text-emerald-100/70 leading-relaxed">
            {inviteUrl ? t('inviteActionBody') : t('inviteUnavailable')}
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-100">
            <Clipboard size={12} />
            {copied === 'invite' ? t('copied') : t('copyInvite')}
          </span>
        </button>

        <Link
          href={newEventHref}
          className="group min-h-36 rounded-lg border border-sky-400/25 bg-sky-500/5 p-4 transition-colors hover:border-sky-300/60"
        >
          <CalendarPlus size={19} className="text-sky-300" />
          <h3 className="mt-3 text-sm font-semibold text-sky-100">{t('eventActionTitle')}</h3>
          <p className="mt-1 text-xs text-sky-100/70 leading-relaxed">{t('eventActionBody')}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-100">
            {t('createEvent')}
          </span>
        </Link>

        <button
          type="button"
          disabled={!canSendDiscordTest || isSending}
          onClick={sendTestAnnouncement}
          className="group min-h-36 rounded-lg border border-amber-400/25 bg-amber-500/5 p-4 text-left transition-colors hover:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex items-start justify-between gap-3">
            {isSending ? (
              <Loader2 size={19} className="text-amber-300 animate-spin flex-shrink-0" />
            ) : (
              <Send size={19} className="text-amber-300 flex-shrink-0" />
            )}
            {!canSendDiscordTest ? <Settings size={15} className="text-amber-200/80" /> : null}
          </div>
          <h3 className="mt-3 text-sm font-semibold text-amber-100">{t('testActionTitle')}</h3>
          <p className="mt-1 text-xs text-amber-100/70 leading-relaxed">
            {canSendDiscordTest ? t('testActionBody') : t('testDisabled')}
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-100">
            {isSending ? t('sendingTest') : t('sendTest')}
          </span>
        </button>

        <Link
          href={guideHref}
          className="group min-h-36 rounded-lg border border-violet-400/25 bg-violet-500/5 p-4 transition-colors hover:border-violet-300/60"
        >
          <BookOpen size={19} className="text-violet-300" />
          <h3 className="mt-3 text-sm font-semibold text-violet-100">{t('guideActionTitle')}</h3>
          <p className="mt-1 text-xs text-violet-100/70 leading-relaxed">{t('guideActionBody')}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-100">
            {t('openGuide')}
          </span>
        </Link>
      </div>

      {!canSendDiscordTest && (
        <Link
          href={settingsHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-soft-foreground hover:text-accent"
        >
          <Settings size={13} />
          {t('openNotificationSettings')}
        </Link>
      )}

      {inviteUrl && (
        <details className="group rounded-lg border border-border bg-background/50 px-3 py-3">
          <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted hover:text-foreground select-none list-none">
            <MessageCircle size={13} />
            <span>{t('toggleMessage')}</span>
            <span className="text-subtle group-open:hidden">▾</span>
            <span className="text-subtle hidden group-open:inline">▴</span>
          </summary>
          <div className="mt-3 space-y-2">
            <textarea
              readOnly
              value={messageTemplate}
              rows={5}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono focus:outline-none focus:border-accent/40 resize-none"
              aria-label={t('messageAriaLabel')}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => copyToClipboard('message', messageTemplate)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent/50"
              >
                {copied === 'message' ? <Check size={12} /> : <Clipboard size={12} />}
                {copied === 'message' ? t('copied') : t('copyMessage')}
              </button>
            </div>
          </div>
        </details>
      )}

      {(copyError || testMessage) && (
        <p
          aria-live="polite"
          className={`rounded-lg border px-3 py-2 text-xs ${
            isTestError || copyError
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
          }`}
        >
          {copyError || testMessage}
        </p>
      )}
    </section>
  )
}
