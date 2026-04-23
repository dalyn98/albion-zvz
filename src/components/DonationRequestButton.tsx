'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Gift, X, Upload, Clipboard } from 'lucide-react'
import { requestDonation } from '@/app/actions/donation'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { useToast } from './ToastProvider'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function DonationRequestButton() {
  const router = useRouter()
  const t = useTranslations('donation')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLLabelElement>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [silverInput, setSilverInput] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const parsedSilver = parseSilverInput(silverInput)
  const amountInvalid = parsedSilver === null || parsedSilver <= 0

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
    if (!open) {
      setFile(null)
      setSilverInput('')
      setMemo('')
      setError('')
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, pending])

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

  const submit = () => {
    if (!file) {
      setError(t('screenshotMissing'))
      return
    }
    if (amountInvalid) {
      setError(t('invalidAmount'))
      return
    }
    setError('')
    const form = new FormData()
    form.append('screenshot', file)
    form.append('silver', parsedSilver!.toString())
    form.append('memo', memo)
    startTransition(async () => {
      const result = await requestDonation(form)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      toast.success(tToast('donationSubmitted'))
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors"
      >
        <Gift size={13} />
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
            aria-labelledby="donation-modal-title"
            className="bg-gray-900 border border-emerald-500/30 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 id="donation-modal-title" className="font-bold text-white text-base inline-flex items-center gap-2">
                <Gift size={15} className="text-emerald-400" />
                {t('modalTitle')}
              </h3>
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
              <p className="text-gray-400 text-xs leading-relaxed">{t('hint')}</p>

              <div>
                <label className="text-gray-400 text-[11px] font-semibold block mb-1">
                  {t('amountLabel')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t('amountPlaceholder')}
                  value={silverInput}
                  onChange={(e) => {
                    setSilverInput(e.target.value)
                    setError('')
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 font-mono"
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
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div>
                <label
                  ref={dropRef}
                  htmlFor="donation-screenshot"
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
                      ? 'bg-gray-800 border border-gray-700 hover:border-emerald-500'
                      : `bg-gray-800 border border-dashed ${dragging ? 'border-emerald-500 text-emerald-400' : 'border-gray-600 hover:border-emerald-500 text-gray-400 hover:text-emerald-400'} py-6`
                  }`}
                >
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
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
                  id="donation-screenshot"
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
                disabled={pending || !file || amountInvalid}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
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
