'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ShieldCheck, X, Upload } from 'lucide-react'
import {
  requestWindowRegear,
  type RegearWindow,
  type WindowRoleOption,
} from '@/app/actions/regear-windows'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { calcPayoutSilver } from '@/lib/regear-payout'
import { useToast } from './ToastProvider'
import { translateSlotRole } from '@/lib/slot-role-i18n'

interface Props {
  window: RegearWindow
  roleOptions: WindowRoleOption[]
  payoutRatePercent: number
  existingActiveCount: number
  craftEnabled: boolean
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function RegearWindowSubmitButton({
  window: w,
  roleOptions,
  payoutRatePercent,
  existingActiveCount,
  craftEnabled,
}: Props) {
  const router = useRouter()
  const t = useTranslations('regear')
  const tWin = useTranslations('regearWindow')
  const tRole = useTranslations('slotRole')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [roleName, setRoleName] = useState<string>(roleOptions[0]?.roleName ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [file2, setFile2] = useState<File | null>(null)
  const [claimedInput, setClaimedInput] = useState('')
  const [error, setError] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [pending, startTransition] = useTransition()

  const selectedReward = roleOptions.find((o) => o.roleName === roleName)?.silver ?? 0
  const atLimit = existingActiveCount >= w.maxDeathsPerMember
  const canSubmit = w.isOpen && roleOptions.length > 0 && !atLimit

  const reset = () => {
    setRoleName(roleOptions[0]?.roleName ?? '')
    setFile(null)
    setFile2(null)
    setClaimedInput('')
    setError('')
    setNeedsVerification(false)
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

  // 모달 안 paste 처리: file → file2 순서로 빈 슬롯에 채운다.
  useEffect(() => {
    if (!open) return
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.kind !== 'file') continue
        if (!ACCEPTED_TYPES.includes(item.type)) continue
        const blob = item.getAsFile()
        if (!blob) continue
        const ext = item.type.split('/')[1]
        const pasted = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: item.type })
        if (!file) {
          setFile(pasted)
          e.preventDefault()
          return
        }
        if (!file2) {
          setFile2(pasted)
          e.preventDefault()
          return
        }
        return
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [open, file, file2])

  const submit = () => {
    if (!file) {
      setError(t('screenshotMissing'))
      return
    }
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
    setNeedsVerification(false)
    startTransition(async () => {
      const form = new FormData()
      form.append('windowId', w.id)
      form.append('roleName', roleName)
      form.append('claimedSilver', parsed.toString())
      form.append('screenshot', file)
      if (file2) form.append('screenshot2', file2)
      const r = await requestWindowRegear(form)
      if (r.error) {
        if (r.error.startsWith(REGEAR_VERIFICATION_ERROR_PREFIX)) {
          setError(r.error.slice(REGEAR_VERIFICATION_ERROR_PREFIX.length))
          setNeedsVerification(true)
        } else {
          setError(r.error)
        }
        return
      }
      setOpen(false)
      reset()
      toast.success(tToast('regearSubmitted'))
      router.refresh()
    })
  }

  const buttonLabel = atLimit
    ? tWin('btnDone')
    : !w.isOpen
      ? tWin('btnClosed')
      : tWin('btnSubmit')

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
        {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regear-window-modal-title"
            className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 id="regear-window-modal-title" className="font-bold text-white text-base truncate pr-2">
                {tWin('modalTitle', { title: w.title })}
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
              {roleOptions.length === 0 ? (
                <p className="text-rose-300 text-xs">{t('ceilingNotSet')}</p>
              ) : (
                <>
                  <FulfillmentModeNotice craftEnabled={craftEnabled} />
                  <div>
                    <label htmlFor="rw-modal-role" className="block text-xs text-gray-400 mb-1">
                      {t('role')}
                    </label>
                    <select
                      id="rw-modal-role"
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
                    <label htmlFor="rw-modal-claim" className="block text-xs text-gray-400 mb-1">
                      {t('claimAmount', { max: formatSilver(selectedReward) })}
                    </label>
                    <input
                      id="rw-modal-claim"
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
                    {payoutRatePercent < 100 && claimedInput && (
                      <p className="text-[11px] text-amber-300 mt-1">
                        {t('expectedPayout', {
                          amount: formatSilver(
                            calcPayoutSilver(parseSilverInput(claimedInput) ?? 0, payoutRatePercent),
                          ),
                          rate: payoutRatePercent,
                        })}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {t('screenshotPrimaryLabel')}
                    </label>
                    <FileSlot
                      file={file}
                      onChange={setFile}
                      placeholder={t('pickOrPaste')}
                      disabled={pending}
                      removeLabel={t('remove')}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {t('screenshotSecondaryLabel')}
                    </label>
                    <FileSlot
                      file={file2}
                      onChange={setFile2}
                      placeholder={t('pickOrPaste')}
                      disabled={pending}
                      removeLabel={t('remove')}
                    />
                  </div>
                  <p className="text-[11px] text-gray-500">{t('pasteHint')}</p>
                </>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 text-xs text-red-300 space-y-1">
                  <p>{error}</p>
                  {needsVerification && (
                    <Link
                      href="/me/profile"
                      className="inline-block text-[11px] text-amber-300 hover:text-amber-200 underline"
                    >
                      {t('verifyCtaLabel')}
                    </Link>
                  )}
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

interface FileSlotProps {
  file: File | null
  onChange: (file: File | null) => void
  placeholder: string
  disabled: boolean
  removeLabel: string
}

interface FulfillmentModeNoticeProps {
  craftEnabled: boolean
}

function FulfillmentModeNotice({ craftEnabled }: FulfillmentModeNoticeProps) {
  const t = useTranslations('regear')
  const label = craftEnabled ? t('modeCraftedLabel') : t('modeSilverLabel')
  const hint = craftEnabled ? t('modeCraftedHint') : t('modeSilverHint')
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-1">
      <p className="text-amber-300 text-[11px] font-semibold">{t('modeNoticeLabel')}</p>
      <p className="text-xs font-bold text-amber-200">{label}</p>
      <p className="text-[10px] text-gray-400 leading-relaxed">{hint}</p>
    </div>
  )
}

function FileSlot({ file, onChange, placeholder, disabled, removeLabel }: FileSlotProps) {
  const inputId = `rw-file-${Math.random().toString(36).slice(2, 8)}`
  return (
    <div className="relative">
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-gray-950 border border-gray-700 px-3 py-2">
          <span className="text-xs text-gray-300 truncate flex-1">{file.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="text-[11px] text-rose-300 hover:text-rose-200 disabled:opacity-50"
          >
            {removeLabel}
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex items-center justify-center gap-2 rounded-md bg-gray-950 border border-dashed border-gray-700 hover:border-amber-400 px-3 py-4 cursor-pointer text-xs text-gray-400 hover:text-amber-300"
        >
          <Upload size={14} />
          {placeholder}
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              if (f && ACCEPTED_TYPES.includes(f.type)) onChange(f)
            }}
            className="hidden"
          />
        </label>
      )}
    </div>
  )
}
