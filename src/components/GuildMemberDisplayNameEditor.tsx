'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, RefreshCcw, Save, UserRoundPen } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  applyGuildMemberNameToDiscord,
  saveGuildMemberDisplayName,
} from '@/app/actions/guild-member-record'

interface Props {
  guildMemberId: string
  discordId: string
  effectiveDisplayName: string
  displayNameOverride: string | null
  discordDisplayName: string
}

export default function GuildMemberDisplayNameEditor({
  guildMemberId,
  discordId,
  effectiveDisplayName,
  displayNameOverride,
  discordDisplayName,
}: Props) {
  const t = useTranslations('members')
  const [displayName, setDisplayName] = useState(displayNameOverride ?? '')
  const [savePending, startSave] = useTransition()
  const [discordPending, startDiscordSync] = useTransition()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const save = () => {
    setError('')
    setSuccess('')
    startSave(async () => {
      const result = await saveGuildMemberDisplayName({
        guildMemberId,
        discordId,
        displayName,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess(t('displayNameSaved'))
    })
  }

  const applyToDiscord = () => {
    setError('')
    setSuccess('')
    startDiscordSync(async () => {
      const result = await applyGuildMemberNameToDiscord({
        guildMemberId,
        discordId,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess(t('displayNameDiscordApplied'))
    })
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-card">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <UserRoundPen size={16} className="text-accent" aria-hidden="true" />
          {t('displayNameTitle')}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {t('displayNameDescription')}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {t('displayNameEffective')}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">
            {effectiveDisplayName}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {t('displayNameDiscordCurrent')}
          </div>
          <div className="mt-1 truncate text-sm text-muted">
            {discordDisplayName}
          </div>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-foreground">
          {t('displayNameOverrideLabel')}
        </span>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={64}
          placeholder={t('displayNameOverridePlaceholder')}
          className="min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent"
        />
        <span className="block text-[11px] leading-relaxed text-subtle">
          {t('displayNameOverrideHint')}
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={savePending || discordPending}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-50"
        >
          {savePending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Save size={14} aria-hidden="true" />
          )}
          {t('displayNameSave')}
        </button>
        <button
          type="button"
          onClick={applyToDiscord}
          disabled={savePending || discordPending}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
        >
          {discordPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCcw size={14} aria-hidden="true" />
          )}
          {t('displayNameApplyDiscord')}
        </button>
      </div>

      {(error || success) && (
        <p
          role="status"
          className={`flex items-center gap-1.5 text-xs ${
            error ? 'text-danger-soft-foreground' : 'text-success-soft-foreground'
          }`}
        >
          {!error && <Check size={13} aria-hidden="true" />}
          {error || success}
        </p>
      )}
    </section>
  )
}
