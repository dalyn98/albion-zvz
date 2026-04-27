'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ShieldCheck, X } from 'lucide-react'
import {
  submitTrackedAdHocRegear,
  type SubmitTrackedAdHocInput,
} from '@/app/actions/regear-tracked-deaths'
import type { WindowRoleOption } from '@/app/actions/regear-windows'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { useToast } from './ToastProvider'
import AdHocDeathBuildStrip from './AdHocDeathBuildStrip'
import type { BuildSnapshot } from '@/types'

interface Props {
  killboardEventId: number
  buildSnapshot: BuildSnapshot
  roleOptions: WindowRoleOption[]
  battleAtLabel: string
  opponentLabel: string
}

// 트래킹 사망 직접 신청 모달. 스크린샷은 받지 않는다 — killboard 행이 곧
// 검증 소스라 서버 액션 쪽에서 killboard_verified=true 로 박아준다.
export default function AdHocDeathSubmitButton({
  killboardEventId,
  buildSnapshot,
  roleOptions,
  battleAtLabel,
  opponentLabel,
}: Props) {
  const router = useRouter()
  const t = useTranslations('regear')
  const tDeath = useTranslations('regearTrackedDeaths')
  const tRole = useTranslations('slotRole')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [roleName, setRoleName] = useState<string>(roleOptions[0]?.roleName ?? '')
  const [claimedInput, setClaimedInput] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const selectedReward = roleOptions.find((o) => o.roleName === roleName)?.silver ?? 0
  const canSubmit = roleOptions.length > 0

  const reset = () => {
    setRoleName(roleOptions[0]?.roleName ?? '')
    setClaimedInput('')
    setError('')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, pending])

  const submit = () => {
    if (!roleName) {
      setError(t('ceilingNotSet'))
      return
    }
    const parsed = parseSilverInput(claimedInput)
    if (parsed === null || parsed <= 0) {
      setError(t('claimInvalid'))
      return
    }
    if (parsed > selectedReward) {
      setError(t('claimOverCeiling', { ceiling: formatSilver(selectedReward) }))
      return
    }
    setError('')
    startTransition(async () => {
      const input: SubmitTrackedAdHocInput = {
        killboardEventId,
        roleName,
        claimedSilver: parsed,
      }
      const r = await submitTrackedAdHocRegear(input)
      if (r.error) {
        setError(r.error)
        return
      }
      setOpen(false)
      reset()
      toast.success(tToast('regearSubmitted'))
      if (r.id) {
        router.push(`/me/regear/${r.id}`)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        disabled={!canSubmit}
        className="flex items-center gap-1.5 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ShieldCheck size={13} />
        {tDeath('btnSubmit')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="adhoc-death-modal-title"
            className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3
                id="adhoc-death-modal-title"
                className="font-bold text-white text-base truncate pr-2"
              >
                {tDeath('modalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white shrink-0"
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
              <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-1">
                <p className="text-[11px] text-gray-400">
                  {tDeath('modalContextBattleAt', { time: battleAtLabel })}
                </p>
                <p className="text-[11px] text-gray-400">
                  {tDeath('modalContextOpponent', { name: opponentLabel })}
                </p>
              </div>

              {roleOptions.length === 0 ? (
                <p className="text-rose-300 text-xs">{t('ceilingNotSet')}</p>
              ) : (
                <>
                  <div>
                    <label htmlFor="adhoc-role" className="block text-xs text-gray-400 mb-1">
                      {t('role')}
                    </label>
                    <select
                      id="adhoc-role"
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      disabled={pending}
                      className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                    >
                      {roleOptions.map((opt) => (
                        <option key={opt.roleName} value={opt.roleName}>
                          {translateSlotRole(opt.roleName, tRole)} · {formatSilver(opt.silver)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="adhoc-claim" className="block text-xs text-gray-400 mb-1">
                      {t('claimAmount', { max: formatSilver(selectedReward) })}
                    </label>
                    <input
                      id="adhoc-claim"
                      type="text"
                      inputMode="numeric"
                      value={claimedInput}
                      onChange={(e) => {
                        setClaimedInput(e.target.value)
                        if (error) setError('')
                      }}
                      disabled={pending}
                      placeholder={t('claimPlaceholder')}
                      className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-800">
                    <p className="text-xs text-gray-400 mb-2">{tDeath('gearLabel')}</p>
                    <p className="text-[11px] text-gray-500 mb-2">{tDeath('gearHint')}</p>
                    <AdHocDeathBuildStrip snapshot={buildSnapshot} />
                  </div>
                </>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 text-xs text-red-300">
                  <p>{error}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                disabled={pending}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || roleOptions.length === 0}
                className="px-4 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-amber-700/50 disabled:cursor-not-allowed text-sm font-bold text-black"
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
