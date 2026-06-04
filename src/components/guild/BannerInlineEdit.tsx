'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Pencil, Upload, Trash2, X, Loader2, Image as ImageIcon } from 'lucide-react'
import {
  uploadGuildProfileBanner,
  clearGuildProfileBanner,
  updateGuildProfileBannerOpacity,
} from '@/app/actions/guild-profile'
import { BANNER_OPACITY_OPTIONS } from '@/lib/guild-profile-config'
import ImageCropModal from '@/components/ImageCropModal'
import { useConfirm } from '@/components/ConfirmDialog'
import { useReportDirty } from '../UnsavedChangesProvider'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const BANNER_ASPECT = 21 / 9

interface Props {
  enabled: boolean
  currentUrl: string
  currentOpacity: number
}

// 공개 길드 페이지 hero 영역 우측 상단에 떠 있는 어드민용 "배너 편집" 버튼.
// 클릭하면 모달이 열려 업로드 / 비우기 가능. 별도 admin 폼을 안 거치고
// 보고 있는 페이지에서 직접 고친다.
export default function BannerInlineEdit({ enabled, currentUrl, currentOpacity }: Props) {
  const t = useTranslations('adminGuildProfile')
  const [open, setOpen] = useState(false)
  if (!enabled) return null
  const label = t('bannerInlineButton')
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-900/80 hover:bg-gray-800 text-amber-200 ring-1 ring-amber-500/40 backdrop-blur-sm text-xs font-semibold transition-colors shadow-lg"
        aria-label={label}
      >
        <Pencil size={12} />
        <span>{label}</span>
      </button>
      {open && (
        <BannerEditModal
          currentUrl={currentUrl}
          currentOpacity={currentOpacity}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

interface ModalProps {
  currentUrl: string
  currentOpacity: number
  onClose: () => void
}

function BannerEditModal({ currentUrl, currentOpacity, onClose }: ModalProps) {
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
  const askConfirm = useConfirm()
  // 옵티미스틱 미리보기 — 사용자가 select 를 바꾸면 즉시 미리보기 이미지 opacity
  // 가 따라간다. 서버 저장은 startTransition 안에서 이뤄지고 router.refresh() 로
  // 최종값과 sync. 저장 실패 시 재페치된 settings 값으로 자동 복구된다.
  const [opacityPreview, setOpacityPreview] = useState(currentOpacity)

  // 모달 내부에서 미저장 파일 선택이 있으면 dirty. opacity 변경은 즉시 저장이라 제외.
  useReportDirty(
    'guild-banner-inline',
    pendingFile !== null || croppedFile !== null,
  )

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

  const handleClear = async () => {
    if (!currentUrl) return
    const ok = await askConfirm({ body: t('bannerRemoveConfirm'), destructive: true })
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

  const handleOpacityChange = (next: number) => {
    setOpacityPreview(next)
    if (next === currentOpacity) return
    setError('')
    startTransition(async () => {
      const result = await updateGuildProfileBannerOpacity(next)
      if (result.error) {
        setError(result.error)
        setOpacityPreview(currentOpacity)
        return
      }
      router.refresh()
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
                style={{ opacity: opacityPreview / 100 }}
              />
              {/* 공개 페이지와 동일한 어두운 그라데이션을 미리보기에도 깔아 실제
                  hero 에서 어떻게 보일지 비슷하게 보여준다. 텍스트는 가짜로
                  넣지 않고 톤만 일치. */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/95 pointer-events-none" />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950 px-4 py-12 text-center">
              <ImageIcon size={28} className="mx-auto text-gray-600" />
              <p className="text-gray-500 text-xs mt-2">{t('bannerEmpty')}</p>
            </div>
          )}

          {currentUrl && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-gray-400 text-xs font-semibold">
                  {t('bannerOpacityLabel')}
                </label>
                <span className="text-amber-300 text-xs font-mono">
                  {opacityPreview}%
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BANNER_OPACITY_OPTIONS.map((opt) => {
                  const active = opacityPreview === opt
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleOpacityChange(opt)}
                      disabled={pending}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                        active
                          ? 'bg-amber-500 text-black ring-1 ring-amber-300'
                          : 'bg-gray-800 hover:bg-gray-700 text-gray-200 ring-1 ring-gray-700'
                      } disabled:opacity-50`}
                    >
                      {opt}%
                    </button>
                  )
                })}
              </div>
              <p className="text-gray-600 text-[11px]">{t('bannerOpacityHint')}</p>
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
