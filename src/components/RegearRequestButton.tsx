'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ShieldCheck, X, Upload, Clipboard } from 'lucide-react'
import { requestRegear } from '@/app/actions/regear'
import { formatSilver, parseSilverInput } from '@/lib/silver'

interface Props {
  eventId: string
  roleName: string | null
  roleReward: number
  alreadyRequested: boolean
  battleStartedAt: string | null
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function formatWindow(iso: string): string {
  const start = new Date(iso)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${fmt(start)} ~ ${fmt(end)}`
}

export default function RegearRequestButton({
  eventId,
  roleName,
  roleReward,
  alreadyRequested,
  battleStartedAt,
}: Props) {
  const router = useRouter()
  const t = useTranslations('regear')
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLLabelElement>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [claimedInput, setClaimedInput] = useState('')
  const parsedClaim = parseSilverInput(claimedInput)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

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
        setFile(pasted)
        setError('')
        e.preventDefault()
        return
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [open])

  const notStarted = !battleStartedAt
  const ceilingMissing = roleReward <= 0
  const disabled = alreadyRequested || !roleName || notStarted || ceilingMissing
  const buttonLabel = alreadyRequested
    ? t('buttonDone')
    : notStarted
      ? t('buttonNotStarted')
      : ceilingMissing
        ? t('buttonCeilingMissing')
        : t('buttonRequest')

  const claimInvalid = parsedClaim === null || parsedClaim <= 0 || parsedClaim > roleReward

  const submit = () => {
    if (!file) {
      setError(t('screenshotMissing'))
      return
    }
    if (ceilingMissing) {
      setError(t('ceilingNotSet'))
      return
    }
    if (claimInvalid) {
      setError(
        parsedClaim === null || parsedClaim <= 0
          ? t('claimInvalid')
          : t('claimOverCeiling', { ceiling: formatSilver(roleReward) }),
      )
      return
    }
    setError('')
    const form = new FormData()
    form.append('eventId', eventId)
    form.append('screenshot', file)
    form.append('claimedSilver', parsedClaim!.toString())
    startTransition(async () => {
      const result = await requestRegear(form)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      setFile(null)
      setClaimedInput('')
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFile(null)
          setError('')
          setOpen(true)
        }}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ShieldCheck size={13} />
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 className="font-bold text-white text-base">{t('modalTitle')}</h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{t('role')}</span>
                  <span className="text-white font-semibold">{roleName ?? t('unassigned')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{t('roleCeiling')}</span>
                  <span className="text-amber-400 font-mono font-semibold">{formatSilver(roleReward)}</span>
                </div>
                {battleStartedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">{t('acceptedWindow')}</span>
                    <span className="text-gray-200 font-mono text-xs">{formatWindow(battleStartedAt)}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-gray-400 text-[11px] font-semibold block mb-1">
                  {t('claimAmount', { max: formatSilver(roleReward) })}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t('claimPlaceholder')}
                  value={claimedInput}
                  onChange={(e) => {
                    setClaimedInput(e.target.value)
                    setError('')
                  }}
                  disabled={ceilingMissing}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono disabled:opacity-50"
                />
                {ceilingMissing ? (
                  <p className="text-red-400 text-[11px] mt-1">
                    {t('ceilingNotSet')}
                  </p>
                ) : (
                  parsedClaim !== null && (
                    <p className="text-gray-500 text-[11px] mt-1">
                      {t('claimAmountPrefix')}{' '}
                      <span className="font-mono text-gray-300">
                        {t('claimAmountWithUnit', { amount: formatSilver(parsedClaim) })}
                      </span>
                      {parsedClaim > roleReward && (
                        <span className="text-red-400 ml-2">{t('overCeiling')}</span>
                      )}
                    </p>
                  )
                )}
              </div>

              <div>
                <label
                  ref={dropRef}
                  htmlFor="regear-screenshot"
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    const dropped = e.dataTransfer.files?.[0]
                    if (dropped && ACCEPTED_TYPES.includes(dropped.type)) {
                      setFile(dropped)
                      setError('')
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-2 w-full rounded-lg cursor-pointer transition-colors overflow-hidden ${
                    previewUrl
                      ? 'bg-gray-800 border border-gray-700 hover:border-amber-500'
                      : `bg-gray-800 border border-dashed ${dragging ? 'border-amber-500 text-amber-400' : 'border-gray-600 hover:border-amber-500 text-gray-400 hover:text-amber-400'} py-6`
                  }`}
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt={t('screenshotAlt')} className="max-h-60 w-auto object-contain" />
                  ) : (
                    <>
                      <Upload size={18} />
                      <span className="text-sm">{t('pickOrPaste')}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                        <Clipboard size={10} />
                        {t('pasteHint')}
                      </span>
                    </>
                  )}
                </label>
                <input
                  id="regear-screenshot"
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null
                    setFile(picked)
                    if (picked) setError('')
                  }}
                />
                {file && (
                  <div className="flex items-center justify-between gap-2 mt-2 text-xs">
                    <span className="text-gray-400 truncate flex-1" title={file.name}>
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null)
                        if (fileRef.current) fileRef.current.value = ''
                      }}
                      className="text-gray-500 hover:text-red-400 flex-shrink-0"
                    >
                      {t('remove')}
                    </button>
                  </div>
                )}
                <p className="text-gray-500 text-xs mt-2 leading-relaxed">
                  {t('uploadHint')}
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                disabled={pending}
                className="text-gray-400 hover:text-white text-sm px-3 py-2"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !file || claimInvalid}
                className="bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
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
