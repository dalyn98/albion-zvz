'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Pencil, Upload, Trash2, X, Loader2, Image as ImageIcon } from 'lucide-react'
import {
  uploadGuildProfileBanner,
  clearGuildProfileBanner,
} from '@/app/actions/guild-profile'
import ImageCropModal from '@/components/ImageCropModal'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const BANNER_ASPECT = 21 / 9

interface Props {
  enabled: boolean
  currentUrl: string
}

// 공개 길드 페이지 hero 영역 우측 상단에 떠 있는 어드민용 "배너 편집" 버튼.
// 클릭하면 모달이 열려 업로드 / 비우기 가능. 별도 admin 폼을 안 거치고
// 보고 있는 페이지에서 직접 고친다.
export default function BannerInlineEdit({ enabled, currentUrl }: Props) {
  const [open, setOpen] = useState(false)
  if (!enabled) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-900/80 hover:bg-gray-800 text-amber-200 ring-1 ring-amber-500/40 backdrop-blur-sm text-xs font-semibold transition-colors shadow-lg"
        aria-label="edit banner"
      >
        <Pencil size={12} />
        <BannerEditLabel />
      </button>
      {open && <BannerEditModal currentUrl={currentUrl} onClose={() => setOpen(false)} />}
    </>
  )
}

function BannerEditLabel() {
  const t = useTranslations('adminGuildProfile')
  return <span>{t('bannerInlineButton')}</span>
}

interface ModalProps {
  currentUrl: string
  onClose: () => void
}

function BannerEditModal({ currentUrl, onClose }: ModalProps) {
  const t = useTranslations('adminGuildProfile')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [croppedFile, setCroppedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const displayUrl = previewUrl || currentUrl

  const resetSelection = () => {
    setPendingFile(null)
    setCroppedFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setSelectedName(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setError('')
    if (!file) {
      resetSelection()
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t('bannerFileTooLarge'))
      event.target.value = ''
      return
    }
    setPendingFile(file)
  }

  const handleCropApply = (cropped: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setCroppedFile(cropped)
    setPreviewUrl(URL.createObjectURL(cropped))
    setSelectedName(cropped.name)
    setPendingFile(null)
  }

  const handleCropCancel = () => {
    resetSelection()
  }

  const handleUpload = () => {
    const file = croppedFile
    if (!file) {
      setError(t('bannerSelectFirst'))
      return
    }
    const form = new FormData()
    form.append('file', file)
    setError('')
    startTransition(async () => {
      const result = await uploadGuildProfileBanner(form)
      if (result.error) {
        setError(result.error)
        return
      }
      resetSelection()
      router.refresh()
      onClose()
    })
  }

  const handleClear = () => {
    if (!currentUrl) return
    const ok = confirm(t('bannerRemoveConfirm'))
    if (!ok) return
    setError('')
    startTransition(async () => {
      const result = await clearGuildProfileBanner()
      if (result.error) {
        setError(result.error)
        return
      }
      resetSelection()
      router.refresh()
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-amber-500/40 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon size={16} className="text-amber-400 flex-shrink-0" />
            <h3 className="font-bold text-white text-base truncate">{t('bannerTitle')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white flex-shrink-0"
            aria-label={tCommon('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <p className="text-gray-500 text-xs">{t('bannerDescription')}</p>

          {displayUrl ? (
            <div className="rounded-xl overflow-hidden border border-gray-700 bg-black aspect-[16/9] sm:aspect-[21/9] relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayUrl}
                alt={t('bannerPreviewAlt')}
                className="w-full h-full object-cover block"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950 px-4 py-12 text-center">
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
              <span className="text-gray-500 text-[11px] truncate max-w-[200px]">
                {selectedName}
              </span>
            )}
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleUpload}
              disabled={pending || !selectedName}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
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

          <p className="text-gray-600 text-[11px]">{t('bannerFileHint')}</p>
        </div>
      </div>

      <ImageCropModal
        file={pendingFile}
        aspect={BANNER_ASPECT}
        onApply={handleCropApply}
        onCancel={handleCropCancel}
      />
    </div>
  )
}
