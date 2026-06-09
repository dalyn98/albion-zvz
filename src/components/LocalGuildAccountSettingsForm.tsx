'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Ban, KeyRound, Loader2, RotateCcw } from 'lucide-react'
import {
  listLocalGuildAccounts,
  resetLocalGuildAccountPassword,
  revokeLocalGuildAccount,
  updateLocalGuildAccountSettings,
  type LocalGuildAccountSummary,
} from '@/app/actions/local-guild-account'
import { ALBION_SERVER_LABEL_KEY, isAlbionServer } from '@/lib/albion-gameinfo'
import { formatDateTime } from '@/lib/format-datetime'
import { useToast } from './ToastProvider'

interface Props {
  embedded?: boolean
  initialEnabled: boolean
  hasInviteCode: boolean
  initialAccounts: LocalGuildAccountSummary[]
  timezone: string
}

type AdminSettingsLabelKey =
  | 'localAccountRelationHomeGuild'
  | 'localAccountRelationAlliance'
  | 'localAccountRelationExternal'
  | 'localAccountRelationUnknown'
  | 'localAccountTrustTrusted'
  | 'localAccountTrustClaimed'
  | 'localAccountTrustRosterMatched'
  | 'localAccountTrustDisputed'
  | 'localAccountTrustRevoked'
  | 'localAccountTrustUnknown'

const RELATION_LABEL_KEY: Record<string, AdminSettingsLabelKey> = {
  home_guild: 'localAccountRelationHomeGuild',
  alliance: 'localAccountRelationAlliance',
  external: 'localAccountRelationExternal',
  unknown: 'localAccountRelationUnknown',
}

const TRUST_STATUS_LABEL_KEY: Record<string, AdminSettingsLabelKey> = {
  trusted: 'localAccountTrustTrusted',
  claimed: 'localAccountTrustClaimed',
  roster_matched: 'localAccountTrustRosterMatched',
  disputed: 'localAccountTrustDisputed',
  revoked: 'localAccountTrustRevoked',
  unknown: 'localAccountTrustUnknown',
}

export default function LocalGuildAccountSettingsForm({
  initialEnabled,
  hasInviteCode,
  initialAccounts,
  timezone,
}: Props) {
  const t = useTranslations('adminSettings')
  const tc = useTranslations('common')
  const toast = useToast()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [guildCode, setGuildCode] = useState('')
  const [error, setError] = useState('')
  const [accountError, setAccountError] = useState('')
  const [accounts, setAccounts] = useState<LocalGuildAccountSummary[]>(initialAccounts)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [passwordById, setPasswordById] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [accountPending, startAccountTransition] = useTransition()

  const refreshAccounts = async () => {
    setLoadingAccounts(true)
    setAccountError('')
    const result = await listLocalGuildAccounts()
    if (result.error) {
      setAccountError(result.error)
      setAccounts([])
    } else {
      setAccounts(result.accounts)
    }
    setLoadingAccounts(false)
  }

  const save = () => {
    setError('')
    startTransition(async () => {
      const result = await updateLocalGuildAccountSettings({ enabled, guildCode })
      if (result.error) {
        setError(result.error)
        return
      }
      setGuildCode('')
      toast.success(t('saved'))
      void refreshAccounts()
    })
  }

  const resetPassword = (account: LocalGuildAccountSummary) => {
    const password = (passwordById[account.id] ?? '').trim()
    if (!password) {
      setAccountError(t('localAccountPasswordRequired'))
      return
    }
    setAccountError('')
    startAccountTransition(async () => {
      const result = await resetLocalGuildAccountPassword(account.id, password)
      if (result.error) {
        setAccountError(result.error)
        return
      }
      setPasswordById((prev) => ({ ...prev, [account.id]: '' }))
      toast.success(t('localAccountPasswordResetDone'))
      await refreshAccounts()
    })
  }

  const revokeAccount = (account: LocalGuildAccountSummary) => {
    if (!window.confirm(t('localAccountRevokeConfirm', { name: account.nickname }))) return
    setAccountError('')
    startAccountTransition(async () => {
      const result = await revokeLocalGuildAccount(account.id)
      if (result.error) {
        setAccountError(result.error)
        return
      }
      toast.success(t('localAccountRevokedDone'))
      await refreshAccounts()
    })
  }

  const formatDate = (value: string | null) => {
    if (!value) return t('localAccountNever')
    if (Number.isNaN(new Date(value).getTime())) return value
    return formatDateTime(value, timezone)
  }
  const serverLabel = (server: string): string =>
    isAlbionServer(server) ? tc(ALBION_SERVER_LABEL_KEY[server]) : server
  const relationLabel = (relation: string): string => {
    const key = RELATION_LABEL_KEY[relation]
    return key ? t(key) : relation
  }
  const trustStatusLabel = (status: string): string => {
    const key = TRUST_STATUS_LABEL_KEY[status]
    return key ? t(key) : status
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/45 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
            <KeyRound size={14} className="text-amber-300" />
            {t('localAccountTitle')}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('localAccountDescription')}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          {enabled ? t('enabled') : t('disabled')}
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-400">
          {hasInviteCode ? t('localAccountRotateCode') : t('localAccountGuildCode')}
        </span>
        <input
          type="password"
          value={guildCode}
          onChange={(e) => setGuildCode(e.target.value)}
          placeholder={hasInviteCode ? t('localAccountRotatePlaceholder') : t('localAccountGuildCodePlaceholder')}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{t('localAccountGuildCodeHint')}</p>
      </label>

      {error && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
      >
        {pending && <Loader2 size={12} className="animate-spin" />}
        {t('save')}
      </button>

      <div className="border-t border-gray-800 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-white">{t('localAccountListTitle')}</h4>
            <p className="mt-0.5 text-[11px] text-gray-500">{t('localAccountListHint')}</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshAccounts()}
            disabled={loadingAccounts || accountPending}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
            title={t('localAccountRefresh')}
            aria-label={t('localAccountRefresh')}
          >
            {loadingAccounts ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RotateCcw size={13} />
            )}
          </button>
        </div>

        {accountError && (
          <p className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {accountError}
          </p>
        )}

        <div className="mt-2 space-y-2">
          {accounts.length === 0 && !loadingAccounts ? (
            <p className="rounded border border-dashed border-gray-800 px-3 py-3 text-xs text-gray-500">
              {t('localAccountListEmpty')}
            </p>
          ) : (
            accounts.map((account) => {
              const revoked = Boolean(account.revokedAt)
              return (
                <div
                  key={account.id}
                  className="rounded-md border border-gray-800 bg-gray-900/55 p-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {account.nickname}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {serverLabel(account.server)} · {relationLabel(account.relation)} · {trustStatusLabel(account.trustStatus)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-600">
                        {t('localAccountLastLogin', { time: formatDate(account.lastLoginAt) })}
                      </p>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        revoked
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {revoked ? t('localAccountRevoked') : t('localAccountActive')}
                    </span>
                  </div>

                  {!revoked && (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="password"
                        value={passwordById[account.id] ?? ''}
                        onChange={(e) =>
                          setPasswordById((prev) => ({ ...prev, [account.id]: e.target.value }))
                        }
                        placeholder={t('localAccountNewPasswordPlaceholder')}
                        className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => resetPassword(account)}
                        disabled={accountPending}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-50"
                      >
                        {accountPending && <Loader2 size={12} className="animate-spin" />}
                        {t('localAccountResetPassword')}
                      </button>
                      <button
                        type="button"
                        onClick={() => revokeAccount(account)}
                        disabled={accountPending}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <Ban size={12} />
                        {t('localAccountRevoke')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
