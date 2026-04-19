'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Image as ImageIcon, Upload, Trash2 } from 'lucide-react'
import { uploadLandingBanner, clearLandingBanner } from '@/app/actions/landing-banner'

interface Props {
  currentUrl: string
}

const MAX_FILE_SIZE = 5 * 1024 * 1024

export default function LandingBannerForm({ currentUrl }: Props) {
  const t = useTranslations('adminLanding')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const displayUrl = previewUrl || currentUrl

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setError('')
    if (!file) {
      setPreviewUrl(null)
      setSelectedName(null)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t('bannerFileTooLarge'))
      event.target.value = ''
      return
    }
    setPreviewUrl(URL.createObjectURL(file))
    setSelectedName(file.name)
  }

  const handleUpload = () => {
    const input = fileRef.current
    const file = input?.files?.[0]
    if (!file) {
      setError(t('bannerSelectFirst'))
      return
    }
    const form = new FormData()
    form.append('file', file)
    setError('')

    startTransition(async () => {
      const result = await uploadLandingBanner(form)
      if (result.error) {
        setError(result.error)
        return
      }
      setPreviewUrl(null)
      setSelectedName(null)
      if (input) input.value = ''
      router.refresh()
    })
  }

  const handleClear = () => {
    if (!currentUrl) return
    const ok = confirm(t('bannerRemoveConfirm'))
    if (!ok) return
    setError('')
    startTransition(async () => {
      const result = await clearLandingBanner()
      if (result.error) {
        setError(result.error)
        return
      }
      setPreviewUrl(null)
      setSelectedName(null)
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white flex items-center gap-2">
          <ImageIcon size={16} className="text-amber-400" />
          {t('bannerTitle')}
        </h2>
        <p className="text-gray-500 text-xs mt-1">
          {t('bannerDescription')}
        </p>
      </div>

      {displayUrl ? (
        <div className="rounded-xl overflow-hidden border border-gray-700 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={displayUrl} alt={t('bannerPreviewAlt')} className="w-full h-auto block" />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950 px-4 py-10 text-center">
          <ImageIcon size={28} className="mx-auto text-gray-600" />
          <p className="text-gray-500 text-xs mt-2">{t('bannerEmpty')}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFileChange}
          className="text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-700 file:bg-gray-800 file:text-gray-200 file:text-xs hover:file:bg-gray-700"
        />
        {selectedName && (
          <span className="text-gray-500 text-[11px] truncate max-w-[200px]">{selectedName}</span>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleUpload}
          disabled={pending || !selectedName}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Upload size={14} />
          {pending ? tCommon('uploading') : t('bannerUploadReplace')}
        </button>

        {currentUrl && (
          <button
            type="button"
            onClick={handleClear}
            disabled={pending}
            className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-300 border border-red-500/40 font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            <Trash2 size={14} />
            {t('bannerRemove')}
          </button>
        )}
      </div>

      <p className="text-gray-600 text-[11px]">
        {t('bannerFileHint')}
      </p>
    </div>
  )
}
