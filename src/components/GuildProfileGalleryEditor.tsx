'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Image as ImageIcon, Upload, Trash2, ArrowUp, ArrowDown, Save, Check } from 'lucide-react'
import {
  addGalleryItem,
  removeGalleryItem,
  moveGalleryItem,
  updateGalleryCaption,
} from '@/app/actions/guild-profile-gallery'
import { GALLERY_MAX_ITEMS, type GalleryItem } from '@/lib/guild-profile-gallery'
import ImageCropModal from '@/components/ImageCropModal'
import { useConfirm } from '@/components/ConfirmDialog'
import { useReportDirty } from './UnsavedChangesProvider'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const CAPTION_MAX_LENGTH = 120
// 갤러리 카드 표시 비율 (16:9) 에 맞춰 자른다.
const GALLERY_ASPECT = 16 / 9

interface Props {
  items: GalleryItem[]
}

export default function GuildProfileGalleryEditor({ items }: Props) {
  const t = useTranslations('adminGuildProfile')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [croppedFile, setCroppedFile] = useState<File | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const askConfirm = useConfirm()

  useReportDirty(
    'guild-profile-gallery-add',
    pendingFile !== null || croppedFile !== null || caption.length > 0,
  )

  const atMax = items.length >= GALLERY_MAX_ITEMS

  const resetSelection = () => {
    setPendingFile(null)
    setCroppedFile(null)
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
      setSelectedName(null)
      return
    }
    setPendingFile(file)
  }

  const handleCropApply = (cropped: File) => {
    setCroppedFile(cropped)
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
    form.append('caption', caption)
    setError('')

    startTransition(async () => {
      const result = await addGalleryItem(form)
      if (result.error) {
        setError(result.error)
        return
      }
      resetSelection()
      setCaption('')
      router.refresh()
    })
  }

  const handleRemove = async (itemId: string) => {
    const ok = await askConfirm({ body: t('galleryRemoveConfirm'), destructive: true })
    if (!ok) return
    setError('')
    setBusyItemId(itemId)
    startTransition(async () => {
      const result = await removeGalleryItem(itemId)
      setBusyItemId(null)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const handleMove = (itemId: string, direction: 'up' | 'down') => {
    setError('')
    setBusyItemId(itemId)
    startTransition(async () => {
      const result = await moveGalleryItem(itemId, direction)
      setBusyItemId(null)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white flex items-center gap-2">
          <ImageIcon size={16} className="text-amber-400" />
          {t('galleryTitle')}
        </h2>
        <p className="text-gray-500 text-xs mt-1">
          {t('galleryDescription', { max: GALLERY_MAX_ITEMS })}
        </p>
      </div>

      {/* 기존 항목 리스트 */}
      {items.length > 0 ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item, idx) => (
            <GalleryItemCard
              key={item.id}
              item={item}
              isFirst={idx === 0}
              isLast={idx === items.length - 1}
              busy={busyItemId === item.id || pending}
              onRemove={() => handleRemove(item.id)}
              onMoveUp={() => handleMove(item.id, 'up')}
              onMoveDown={() => handleMove(item.id, 'down')}
            />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950 px-4 py-8 text-center">
          <ImageIcon size={24} className="mx-auto text-gray-600" />
          <p className="text-gray-500 text-xs mt-2">{t('galleryEmpty')}</p>
        </div>
      )}

      {/* 업로드 폼 */}
      {!atMax ? (
        <div className="space-y-2 border-t border-gray-800 pt-3">
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
          <div>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={CAPTION_MAX_LENGTH}
              placeholder={t('galleryCaptionPlaceholder')}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            <span className="text-gray-500 text-[11px]">
              {caption.length}/{CAPTION_MAX_LENGTH}
            </span>
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={pending || !selectedName}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            <Upload size={14} />
            {pending ? tCommon('uploading') : t('galleryAdd')}
          </button>
        </div>
      ) : (
        <p className="text-amber-300 text-xs">{t('galleryAtMaxLabel', { max: GALLERY_MAX_ITEMS })}</p>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
      <p className="text-gray-600 text-[11px]">{t('bannerFileHint')}</p>

      <ImageCropModal
        file={pendingFile}
        aspect={GALLERY_ASPECT}
        onApply={handleCropApply}
        onCancel={handleCropCancel}
      />
    </section>
  )
}

interface GalleryItemCardProps {
  item: GalleryItem
  isFirst: boolean
  isLast: boolean
  busy: boolean
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function GalleryItemCard({
  item,
  isFirst,
  isLast,
  busy,
  onRemove,
  onMoveUp,
  onMoveDown,
}: GalleryItemCardProps) {
  const t = useTranslations('adminGuildProfile')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [caption, setCaption] = useState(item.caption)
  const [savingCaption, setSavingCaption] = useState(false)
  const [savedCaption, setSavedCaption] = useState(false)
  const [, startTransition] = useTransition()

  const captionDirty = caption !== item.caption
  useReportDirty(`gallery-item-caption:${item.id}`, captionDirty)

  const handleSaveCaption = () => {
    setSavingCaption(true)
    setSavedCaption(false)
    startTransition(async () => {
      const result = await updateGalleryCaption(item.id, caption)
      setSavingCaption(false)
      if (!result.error) {
        setSavedCaption(true)
        router.refresh()
      }
    })
  }

  return (
    <li className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
      <div className="aspect-[16/9] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt={item.caption || t('galleryItemAlt')}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value)
              setSavedCaption(false)
            }}
            maxLength={CAPTION_MAX_LENGTH}
            placeholder={t('galleryCaptionPlaceholder')}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={handleSaveCaption}
            disabled={busy || !captionDirty}
            className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 disabled:bg-gray-800 disabled:text-gray-500 text-amber-200 font-semibold px-2 py-1.5 rounded-md text-xs"
            title={tCommon('save')}
          >
            <Save size={12} />
          </button>
        </div>
        {savedCaption && !captionDirty && (
          <span className="text-[11px] text-emerald-400 flex items-center gap-1">
            <Check size={10} />
            {tCommon('saved')}
          </span>
        )}
        {savingCaption && (
          <span className="text-[11px] text-gray-500">{tCommon('saving')}</span>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={busy || isFirst}
            className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-200 font-semibold px-2 py-1.5 rounded-md text-xs"
            title={t('galleryMoveUp')}
          >
            <ArrowUp size={12} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={busy || isLast}
            className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-200 font-semibold px-2 py-1.5 rounded-md text-xs"
            title={t('galleryMoveDown')}
          >
            <ArrowDown size={12} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="ml-auto flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-300 border border-red-500/40 font-semibold px-2 py-1.5 rounded-md text-xs"
            title={t('galleryRemove')}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </li>
  )
}
