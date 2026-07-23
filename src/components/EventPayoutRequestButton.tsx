'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Coins, X, Users } from 'lucide-react'
import {
  createEventPayoutRequest,
  listEventPayoutEligibleParticipants,
  type EventPayoutEligibleParticipant,
} from '@/app/actions/event-payout-admin'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { acquireBodyScrollLock } from '@/lib/body-scroll-lock'
import { useToast } from './ToastProvider'

interface Props {
  eventId: string
}

export default function EventPayoutRequestButton({ eventId }: Props) {
  const router = useRouter()
  const t = useTranslations('adminEventPayoutCreate')
  const tCommon = useTranslations('common')
  const tToast = useTranslations('toast')
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [silverInput, setSilverInput] = useState('')
  const [memo, setMemo] = useState('')
  const [participants, setParticipants] = useState<EventPayoutEligibleParticipant[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const parsedSilver = parseSilverInput(silverInput)
  const amountInvalid = parsedSilver === null || parsedSilver <= 0

  useEffect(() => {
    if (!open) {
      // 모달 닫힐 때 일괄 reset — open prop 변화 → 로컬 form state 동기화.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSilverInput('')
      setMemo('')
      setError('')
      setParticipants([])
      setLoadError('')
      return
    }
    setLoadingParticipants(true)
    ;(async () => {
      const result = await listEventPayoutEligibleParticipants(eventId)
      setLoadingParticipants(false)
      if (result.error) {
        setLoadError(result.error)
        return
      }
      setParticipants(result.participants)
    })()
    const releaseScrollLock = acquireBodyScrollLock()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      releaseScrollLock()
      document.removeEventListener('keydown', onKey)
    }
  }, [open, eventId, pending])

  const submit = () => {
    if (amountInvalid || participants.length === 0) return
    setError('')
    startTransition(async () => {
      const result = await createEventPayoutRequest({
        eventId,
        silverPerMember: parsedSilver!,
        memo: memo.trim(),
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      toast.success(tToast('eventPayoutSubmitted'))
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors"
      >
        <Coins size={13} />
        {t('openButton')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-payout-modal-title"
            className="bg-gray-900 border border-amber-500/30 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3
                id="event-payout-modal-title"
                className="font-bold text-white text-base inline-flex items-center gap-2"
              >
                <Coins size={15} className="text-amber-400" />
                {t('modalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3 text-sm">
              <p className="text-gray-400 text-xs leading-relaxed">{t('hint')}</p>

              <div>
                <label className="text-gray-400 text-[11px] font-semibold block mb-1">
                  {t('silverPerMemberLabel')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t('silverPerMemberPlaceholder')}
                  value={silverInput}
                  onChange={(e) => {
                    setSilverInput(e.target.value)
                    setError('')
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono"
                />
                {parsedSilver !== null && parsedSilver > 0 && (
                  <p className="text-gray-500 text-[11px] mt-1 font-mono">
                    {formatSilver(parsedSilver)} silver
                  </p>
                )}
              </div>

              <div>
                <label className="text-gray-400 text-[11px] font-semibold block mb-1">
                  {t('memoLabel')}
                </label>
                <textarea
                  rows={2}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  maxLength={500}
                  placeholder={t('memoPlaceholder')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-800 text-xs flex items-center justify-between gap-2">
                  <span className="text-gray-300 font-semibold inline-flex items-center gap-1.5">
                    <Users size={12} className="text-amber-400" />
                    {t('participantsLabel')}
                  </span>
                  <span className="text-amber-300 font-mono">
                    {t('participantCount', { count: participants.length })}
                  </span>
                </div>
                <div className="max-h-44 overflow-y-auto px-3 py-2 text-xs">
                  {loadingParticipants ? (
                    <p className="text-gray-500">{tCommon('loadingDots')}</p>
                  ) : loadError ? (
                    <p className="text-red-400">{loadError}</p>
                  ) : participants.length === 0 ? (
                    <p className="text-gray-500">{t('noParticipants')}</p>
                  ) : (
                    <ul className="space-y-1 font-mono text-gray-300">
                      {participants.map((p) => (
                        <li key={p.discord_id} className="truncate">
                          {p.username}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {parsedSilver && participants.length > 0 && (
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2 text-xs">
                  <p className="text-gray-400">
                    {t('totalPreview', {
                      perMember: formatSilver(parsedSilver),
                      count: participants.length,
                      total: formatSilver(parsedSilver * participants.length),
                    })}
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}
            </div>

            <div className="safe-area-bottom flex-shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                disabled={pending}
                className="text-gray-400 hover:text-white text-sm px-3 py-2"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || amountInvalid || participants.length === 0}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('submitting') : t('submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
