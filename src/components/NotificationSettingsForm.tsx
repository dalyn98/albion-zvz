'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import {
  uploadNotificationImage,
  clearNotificationImage,
} from '@/app/actions/notification-image'
import { Image as ImageIcon, Save, Trash2, Upload } from 'lucide-react'

interface Props {
  initialMessage: string
  initialImageUrl: string
}

const MAX_LENGTH = 500
const MAX_FILE_SIZE = 5 * 1024 * 1024

export default function NotificationSettingsForm({
  initialMessage,
  initialImageUrl,
}: Props) {
  const t = useTranslations('adminSettings')
  const router = useRouter()
  const [message, setMessage] = useState(initialMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [imgError, setImgError] = useState('')
  const [imgPending, startImgTransition] = useTransition()

  const dirty = message !== initialMessage
  const tooLong = message.length > MAX_LENGTH
  const displayImageUrl = previewUrl || initialImageUrl

  const handleSave = async () => {
    if (!message.trim()) {
      setError(t('messageEmpty'))
      return
    }
    if (tooLong) {
      setError(t('messageTooLong', { max: MAX_LENGTH }))
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting('event_notification_message', message)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setImgError('')
    if (!file) {
      setPreviewUrl(null)
      setSelectedName(null)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setImgError(t('notificationImageFileTooLarge'))
      event.target.value = ''
      return
    }
    setPreviewUrl(URL.createObjectURL(file))
    setSelectedName(file.name)
  }

  const handleUploadImage = () => {
    const input = fileRef.current
    const file = input?.files?.[0]
    if (!file) {
      setImgError(t('notificationImageSelectFirst'))
      return
    }
    const form = new FormData()
    form.append('file', file)
    setImgError('')

    startImgTransition(async () => {
      const result = await uploadNotificationImage(form)
      if (result.error) {
        setImgError(result.error)
        return
      }
      setPreviewUrl(null)
      setSelectedName(null)
      if (input) input.value = ''
      router.refresh()
    })
  }

  const handleClearImage = () => {
    if (!initialImageUrl) return
    const ok = confirm(t('notificationImageRemoveConfirm'))
    if (!ok) return
    setImgError('')
    startImgTransition(async () => {
      const result = await clearNotificationImage()
      if (result.error) {
        setImgError(result.error)
        return
      }
      setPreviewUrl(null)
      setSelectedName(null)
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-5">
      <div>
        <h2 className="font-bold text-white">{t('notificationsTitle')}</h2>
        <p className="text-gray-500 text-xs mt-1">
          {t('notificationsDescription')}
        </p>
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('messageLabel')}</label>
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            setSaved(false)
          }}
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-y"
          placeholder={t('messagePlaceholder')}
        />
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[11px] ${tooLong ? 'text-red-400' : 'text-gray-500'}`}>
            {message.length}/{MAX_LENGTH}
          </span>
          {saved && !dirty && <span className="text-[11px] text-emerald-400">{t('saved')}</span>}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={loading || !dirty || tooLong}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
      >
        <Save size={14} />
        {loading ? t('saving') : t('save')}
      </button>

      <div className="border-t border-gray-800 pt-4 space-y-3">
        <div>
          <h3 className="font-bold text-white flex items-center gap-2 text-sm">
            <ImageIcon size={14} className="text-amber-400" />
            {t('notificationImageTitle')}
          </h3>
          <p className="text-gray-500 text-xs mt-1">
            {t('notificationImageDescription')}
          </p>
        </div>

        {displayImageUrl ? (
          <div className="rounded-xl overflow-hidden border border-gray-700 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImageUrl}
              alt={t('notificationImagePreviewAlt')}
              className="w-full h-auto block"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950 px-4 py-8 text-center">
            <ImageIcon size={24} className="mx-auto text-gray-600" />
            <p className="text-gray-500 text-xs mt-2">{t('notificationImageEmpty')}</p>
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
            {imgPending ? t('saving') : t('notificationImageUploadReplace')}
          </button>

          {initialImageUrl && (
            <button
              type="button"
              onClick={handleClearImage}
              disabled={imgPending}
              className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-300 border border-red-500/40 font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <Trash2 size={14} />
              {t('notificationImageRemove')}
            </button>
          )}
        </div>

        <p className="text-gray-600 text-[11px]">{t('notificationImageFileHint')}</p>
      </div>
    </div>
  )
}
