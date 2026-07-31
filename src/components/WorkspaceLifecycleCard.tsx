'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import {
  cancelWorkspaceDeletion,
  requestWorkspaceDeletion,
  type WorkspaceLifecycleActionError,
} from '@/app/actions/tenant-lifecycle'
import type { TenantLifecycleState } from '@/lib/tenant-lifecycle'
import { buildLoginEntryHref } from '@/lib/login-entry'

interface Props {
  state: TenantLifecycleState
  recentlyAuthenticated: boolean
  recoveryOnly?: boolean
}

export default function WorkspaceLifecycleCard({
  state,
  recentlyAuthenticated,
  recoveryOnly = false,
}: Props) {
  const t = useTranslations('workspaceLifecycle')
  const [typedName, setTypedName] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<WorkspaceLifecycleActionError | null>(
    null,
  )
  const [success, setSuccess] = useState<'requested' | 'cancelled' | null>(
    null,
  )
  const [recoveryHref, setRecoveryHref] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const isDeletionPending = state.status === 'deletion_pending'
  const nameMatches = typedName === state.guildName
  const activeObligations = state.obligations.items.filter(
    (item) => item.count > 0,
  )
  const reauthHref = buildLoginEntryHref({
    returnTo: `/onboard/setup/${state.guildId}`,
    forceConsent: true,
  })

  const submitDeletion = () => {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await requestWorkspaceDeletion({
        guildId: state.guildId,
        expectedGuildName: typedName,
        confirmIrreversible: confirmed,
        reason,
      })
      if (!result.ok) {
        setError(result.error ?? 'action_failed')
        if (result.reauthHref) setRecoveryHref(result.reauthHref)
        return
      }
      setRecoveryHref(result.reauthHref ?? reauthHref)
      setSuccess('requested')
    })
  }

  const cancelDeletion = () => {
    if (!state.deletionRequestId) {
      setError('not_found')
      return
    }
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await cancelWorkspaceDeletion({
        guildId: state.guildId,
        requestId: state.deletionRequestId!,
        expectedGuildName: typedName,
        confirmRestore: confirmed,
      })
      if (!result.ok) {
        setError(result.error ?? 'action_failed')
        if (result.reauthHref) setRecoveryHref(result.reauthHref)
        return
      }
      setSuccess('cancelled')
      const destination =
        result.tenantStatus === 'active'
          ? '/'
          : `/onboard/setup/${state.guildId}`
      window.location.assign(destination)
    })
  }

  const destructiveDisabled =
    pending ||
    !recentlyAuthenticated ||
    !nameMatches ||
    !confirmed ||
    (!isDeletionPending && state.obligations.total > 0)

  return (
    <section
      className={`rounded-xl border p-4 sm:p-5 ${
        isDeletionPending
          ? 'border-red-500/40 bg-red-950/20'
          : 'border-gray-800 bg-gray-950/55'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 rounded-lg p-2 ${
            isDeletionPending
              ? 'bg-red-500/15 text-red-300'
              : 'bg-amber-500/10 text-amber-300'
          }`}
        >
          {isDeletionPending ? <RotateCcw size={18} /> : <Trash2 size={18} />}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">
            {isDeletionPending ? t('recoveryTitle') : t('deleteTitle')}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            {isDeletionPending
              ? t('recoveryDescription')
              : t('deleteDescription')}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-800 bg-black/20 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-500">{t('statusLabel')}</span>
          <span className="font-semibold text-gray-200">
            {t(`status_${state.status}`)}
          </span>
        </div>
        {state.purgeAt && (
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-gray-500">{t('purgeAtLabel')}</span>
            <time
              className="text-right font-semibold text-red-200"
              dateTime={state.purgeAt}
            >
              {new Date(state.purgeAt).toLocaleString()}
            </time>
          </div>
        )}
      </div>

      {!isDeletionPending && activeObligations.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={15}
              className="mt-0.5 shrink-0 text-amber-300"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-200">
                {t('obligationsTitle', {
                  count: state.obligations.total,
                })}
              </p>
              <ul className="mt-2 space-y-1">
                {activeObligations.map((item) => (
                  <li key={item.key}>
                    <a
                      href={item.path}
                      className="inline-flex items-center gap-1 text-xs text-amber-100 underline decoration-amber-500/50 underline-offset-2 hover:text-white"
                    >
                      {t(`obligation_${item.key}`, {
                        count: item.count,
                      })}
                      <ExternalLink size={11} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {!isDeletionPending && !recoveryOnly && (
        <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900/70 p-3">
          <p className="text-xs leading-relaxed text-gray-300">
            {t('backupDescription')}
          </p>
          <a
            href="/admin/dashboard/backup"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-100 underline decoration-gray-600 underline-offset-2 hover:text-white"
          >
            {t('backupButton')}
            <ExternalLink size={11} />
          </a>
        </div>
      )}

      {!recentlyAuthenticated && (
        <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <p className="text-xs leading-relaxed text-blue-100">
            {t('reauthDescription')}
          </p>
          <a
            href={recoveryHref ?? reauthHref}
            className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-400 px-3 py-1.5 text-xs font-bold text-gray-950 hover:bg-blue-300"
          >
            {t('reauthButton')}
            <ExternalLink size={12} />
          </a>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-300">
            {t('nameConfirmationLabel')}
          </span>
          <input
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            autoComplete="off"
            placeholder={state.guildName}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-400 focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-gray-500">
            {t('nameConfirmationHint', { name: state.guildName })}
          </span>
        </label>

        {!isDeletionPending && !recoveryOnly && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-300">
              {t('reasonLabel')}
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              className="w-full resize-y rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-400 focus:outline-none"
              placeholder={t('reasonPlaceholder')}
            />
          </label>
        )}

        <label className="flex items-start gap-2 text-xs leading-relaxed text-gray-300">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-500"
          />
          <span>
            {isDeletionPending
              ? t('restoreConfirmation')
              : t('deleteConfirmation')}
          </span>
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {t(`error_${error}`)}
        </p>
      )}
      {success && (
        <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          <p>
            {success === 'requested'
              ? t('requestSuccess')
              : t('cancelSuccess')}
          </p>
          {success === 'requested' && recoveryHref && (
            <a
              href={recoveryHref}
              className="mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              {t('openRecovery')}
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={destructiveDisabled}
        onClick={isDeletionPending ? cancelDeletion : submitDeletion}
        className={`mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          isDeletionPending
            ? 'bg-emerald-500 text-gray-950 hover:bg-emerald-400'
            : 'bg-red-500 text-white hover:bg-red-400'
        }`}
      >
        {pending && <Loader2 size={13} className="animate-spin" />}
        {isDeletionPending ? t('cancelButton') : t('deleteButton')}
      </button>
    </section>
  )
}
