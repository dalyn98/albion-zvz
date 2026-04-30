'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ShieldCheck, Upload, X } from 'lucide-react'
import { submitTrackedAdHocRegear } from '@/app/actions/regear-tracked-deaths'
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

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// 트래킹 사망 직접 신청 모달. killboard_verified=true 가 검증 소스이므로
// 스크린샷은 옵션 — 청구자가 갱크 상황·잔여 인원 등 추가 컨텍스트를 첨부하고
// 싶을 때만 사용한다.
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
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const selectedReward = roleOptions.find((o) => o.roleName === roleName)?.silver ?? 0
  const canSubmit = roleOptions.length > 0

  const reset = () => {
    setRoleName(roleOptions[0]?.roleName ?? '')
    setClaimedInput('')
    setFile(null)
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

  // 모달 안 paste 처리 — 빈 슬롯에만 채운다 (이미 첨부된 파일 덮어쓰기 방지).
  useEffect(() => {
    if (!open) return
    const handlePaste = (e: ClipboardEvent) => {
      if (file) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.kind !== 'file') continue
        if (!ACCEPTED_TYPES.includes(item.type)) continue
        const blob = item.getAsFile()
        if (!blob) continue
        const ext = item.type.split('/')[1]
        const pasted = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: item.type })
        setFile(pasted)
        e.preventDefault()
        return
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [open, file])

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
      const form = new FormData()
      form.append('killboardEventId', String(killboardEventId))
      form.append('roleName', roleName)
      form.append('claimedSilver', String(parsed))
      if (file) form.append('screenshot', file)
      const r = await submitTrackedAdHocRegear(form)
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

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {tDeath('screenshotLabel')}
                    </label>
                    <p className="text-[11px] text-gray-500 mb-2">
                      {tDeath('screenshotHint')}
                    </p>
                    <FileSlot
                      file={file}
                      onChange={setFile}
                      placeholder={t('pickOrPaste')}
                      disabled={pending}
                      removeLabel={t('remove')}
                    />
                    <p className="text-[11px] text-gray-500 mt-1">{t('pasteHint')}</p>
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

interface FileSlotProps {
  file: File | null
  onChange: (file: File | null) => void
  placeholder: string
  disabled: boolean
  removeLabel: string
}

function FileSlot({ file, onChange, placeholder, disabled, removeLabel }: FileSlotProps) {
  const inputId = useId()
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
