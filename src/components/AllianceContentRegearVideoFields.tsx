'use client'

import { CheckCircle2, Link2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type {
  AllianceContentRegearLinkedSubmission,
  AllianceContentRegearVideoOption,
} from '@/lib/alliance-content-regear-video'
import { formatDateTime } from '@/lib/format-datetime'

interface Props {
  option: AllianceContentRegearVideoOption | null
  linkedSubmission?: AllianceContentRegearLinkedSubmission | null
  timezone: string
  hasVideo: boolean
  checked: boolean
  selectedSessionId: string
  inferredSessionId: string | null
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  onSessionChange: (sessionId: string) => void
}

export default function AllianceContentRegearVideoFields({
  option,
  linkedSubmission = null,
  timezone,
  hasVideo,
  checked,
  selectedSessionId,
  inferredSessionId,
  disabled = false,
  onCheckedChange,
  onSessionChange,
}: Props) {
  const t = useTranslations('regear')

  if (linkedSubmission) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" />
          <div>
            <p className="font-semibold">{t('allianceVideoLinkedTitle')}</p>
            <p className="mt-1 leading-relaxed text-emerald-200/80">
              {t(
                linkedSubmission.status === 'approved'
                  ? 'allianceVideoLinkedApproved'
                  : 'allianceVideoLinkedPending',
              )}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!option) return null

  const controlsDisabled = disabled || !hasVideo
  const isInferredSelection = Boolean(
    inferredSessionId && selectedSessionId === inferredSessionId,
  )

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-xs">
      <div className="flex items-start gap-2">
        <Link2 size={15} className="mt-0.5 shrink-0 text-violet-300" />
        <div className="min-w-0 flex-1">
          <label className="flex cursor-pointer items-start gap-2 text-violet-100">
            <input
              type="checkbox"
              checked={checked}
              disabled={controlsDisabled}
              onChange={(event) => onCheckedChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-violet-500/50 bg-gray-950 text-violet-500"
            />
            <span className="font-semibold">{t('allianceVideoReuseLabel')}</span>
          </label>
          <p className="mt-1 leading-relaxed text-violet-200/70">
            {t('allianceVideoReuseHint', { due: formatDateTime(option.dueAt, timezone) })}
          </p>
          {!hasVideo && (
            <p className="mt-1 text-gray-500">{t('allianceVideoNeedsProof')}</p>
          )}

          {checked && hasVideo && (
            <div className="mt-3 space-y-1.5">
              <label htmlFor={`alliance-session-${option.requirementId}`} className="block text-violet-200">
                {t('allianceVideoSessionLabel')}
              </label>
              <select
                id={`alliance-session-${option.requirementId}`}
                value={selectedSessionId}
                disabled={disabled}
                onChange={(event) => onSessionChange(event.target.value)}
                className="w-full rounded-lg border border-violet-500/30 bg-gray-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-50"
              >
                <option value="">{t('allianceVideoSelectSession')}</option>
                {option.sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {formatDateTime(session.endedAt, timezone)}
                  </option>
                ))}
              </select>
              <p className={isInferredSelection ? 'text-emerald-300' : 'text-violet-200/60'}>
                {isInferredSelection
                  ? t('allianceVideoSessionAutoSelected')
                  : t('allianceVideoSessionSelectHint')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
