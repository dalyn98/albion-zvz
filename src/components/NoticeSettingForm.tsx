'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import {
  uploadNoticeImage,
  clearNoticeImage,
  type NoticeTarget,
} from '@/app/actions/notice-image'
import type { AppSettingKey } from '@/lib/app-settings'
import { Image as ImageIcon, Save, Eraser, Upload, Trash2 } from 'lucide-react'
import ImageCropModal from '@/components/ImageCropModal'
import { useConfirm } from '@/components/ConfirmDialog'
import { useReportDirty } from './UnsavedChangesProvider'

export const NOTICE_MAX_LENGTH = 500
const MAX_FILE_SIZE = 5 * 1024 * 1024

interface Props {
  settingKey: AppSettingKey
  // target/initialImageUrl are optional — the shop delivery notice is text-only,
  // so image upload UI is suppressed when target is omitted.
  target?: NoticeTarget
  initialMessage: string
  initialImageUrl?: string
  title: string
  description: string
  label: string
  placeholder: string
  clearLabel: string
  clearTooltip: string
  tooLongMessage: string
  embedded?: boolean
}

export default function NoticeSettingForm({
  settingKey,
  target,
  initialMessage,
  initialImageUrl = '',
  title,
  description,
  label,
  placeholder,
  clearLabel,
  clearTooltip,
  tooLongMessage,
  embedded = false,
}: Props) {
  const tCommon = useTranslations('common')
  const t = useTranslations('adminSettings')
  const router = useRouter()
  const textareaId = useId()
  const [text, setText] = useState(initialMessage)
  const [savedText, setSavedText] = useState(initialMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [croppedFile, setCroppedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [imgError, setImgError] = useState('')
  const [imgPending, startImgTransition] = useTransition()
  const askConfirm = useConfirm()

  const dirty = text !== savedText
  const tooLong = text.length > NOTICE_MAX_LENGTH
  const displayImageUrl = previewUrl || initialImageUrl
  // settingKey 로 instance 식별 — 한 페이지에 여러 NoticeSettingForm 이 동시에 마운트될 수 있음.
  // pendingFile/croppedFile 도 unsaved upload 로 간주.
  useReportDirty(
    `notice-setting:${settingKey}`,
    dirty || pendingFile !== null || croppedFile !== null,
  )

  const handleSave = async () => {
    if (tooLong) {
      setError(tooLongMessage)
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting(settingKey, text)
    if (result.error) {
      setError(result.error)
    } else {
      setSavedText(text)
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  const handleClear = () => {
    setText('')
    setSaved(false)
  }

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
    setImgError('')
    if (!file) {
      resetSelection()
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setImgError(t('noticeImageFileTooLarge'))
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

  const handleUploadImage = () => {
    if (!target) return
    const file = croppedFile
    if (!file) {
      setImgError(t('noticeImageSelectFirst'))
      return
    }
    const form = new FormData()
    form.append('file', file)
    setImgError('')

    startImgTransition(async () => {
      const result = await uploadNoticeImage(target, form)
      if (result.error) {
        setImgError(result.error)
        return
      }
      resetSelection()
      router.refresh()
    })
  }

  const handleClearImage = async () => {
    if (!target) return
    if (!initialImageUrl) return
    const ok = await askConfirm({ body: t('noticeImageRemoveConfirm'), destructive: true })
    if (!ok) return
    setImgError('')
    startImgTransition(async () => {
      const result = await clearNoticeImage(target)
      if (result.error) {
        setImgError(result.error)
        return
      }
      resetSelection()
      router.refresh()
    })
  }

  const containerClass = embedded
    ? 'space-y-4'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-5'

  return (
    <div className={containerClass}>
      <div>
        {embedded ? (
          <h3 className="font-semibold text-white text-sm">{title}</h3>
        ) : (
          <h2 className="font-bold text-white">{title}</h2>
        )}
        <p className="text-gray-500 text-xs mt-1">{description}</p>
      </div>

      <div>
        <label htmlFor={textareaId} className="text-gray-400 text-xs mb-1 block">{label}</label>
        <textarea
          id={textareaId}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSaved(false)
          }}
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-y"
          placeholder={placeholder}
        />
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[11px] ${tooLong ? 'text-red-400' : 'text-gray-500'}`}>
            {text.length}/{NOTICE_MAX_LENGTH}
          </span>
          {saved && !dirty && <span className="text-[11px] text-emerald-400">{tCommon('saved')}</span>}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty || tooLong}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? tCommon('saving') : tCommon('save')}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={loading || text === ''}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/40 disabled:text-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors text-xs"
          title={clearTooltip}
        >
          <Eraser size={12} />
          {clearLabel}
        </button>
      </div>

      {target && (
      <div className="border-t border-gray-800 pt-4 space-y-3">
        <div>
          <h3 className="font-bold text-white flex items-center gap-2 text-sm">
            <ImageIcon size={14} className="text-amber-400" />
            {t('noticeImageTitle')}
          </h3>
          <p className="text-gray-500 text-xs mt-1">{t('noticeImageDescription')}</p>
        </div>

        {displayImageUrl ? (
          <div className="rounded-xl overflow-hidden border border-gray-700 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImageUrl}
              alt={t('noticeImagePreviewAlt')}
              className="w-full h-auto block"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950 px-4 py-8 text-center">
            <ImageIcon size={24} className="mx-auto text-gray-600" />
            <p className="text-gray-500 text-xs mt-2">{t('noticeImageEmpty')}</p>
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

        {imgError && <p className="text-red-400 text-xs">{imgError}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleUploadImage}
            disabled={imgPending || !selectedName}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            <Upload size={14} />
            {imgPending ? tCommon('saving') : t('noticeImageUploadReplace')}
          </button>

          {initialImageUrl && (
            <button
              type="button"
              onClick={handleClearImage}
              disabled={imgPending}
              className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-300 border border-red-500/40 font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <Trash2 size={14} />
              {t('noticeImageRemove')}
            </button>
          )}
        </div>

        <p className="text-gray-600 text-[11px]">{t('noticeImageFileHint')}</p>
      </div>
      )}

      {target && (
        <ImageCropModal
          file={pendingFile}
          onApply={handleCropApply}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}
