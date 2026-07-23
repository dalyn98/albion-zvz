'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pencil, X } from 'lucide-react'
import GuildProfileGalleryEditor from '@/components/GuildProfileGalleryEditor'
import type { GalleryItem } from '@/lib/guild-profile-gallery-config'
import { useBodyScrollLock } from '../useBodyScrollLock'

interface Props {
  enabled: boolean
  items: GalleryItem[]
}

// 공개 길드 페이지 갤러리 카드 우측 상단의 어드민용 "편집" 버튼. 클릭 시
// 모달 열림 → 기존 GuildProfileGalleryEditor 를 그대로 띄워 추가/삭제/순서/캡션 처리.
export default function GalleryInlineEdit({ enabled, items }: Props) {
  const [open, setOpen] = useState(false)
  if (!enabled) return null
  return (
    <>
      <EditPin onClick={() => setOpen(true)} />
      {open && <GalleryEditModal items={items} onClose={() => setOpen(false)} />}
    </>
  )
}

function EditPin({ onClick }: { onClick: () => void }) {
  const t = useTranslations('adminGuildProfile')
  const label = t('galleryInlineButton')
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-900/80 hover:bg-gray-800 text-amber-200 ring-1 ring-amber-500/40 backdrop-blur-sm text-[11px] font-semibold transition-colors shadow"
      aria-label={label}
    >
      <Pencil size={11} />
      <span>{label}</span>
    </button>
  )
}

interface ModalProps {
  items: GalleryItem[]
  onClose: () => void
}

function GalleryEditModal({ items, onClose }: ModalProps) {
  const t = useTranslations('adminGuildProfile')
  const tCommon = useTranslations('common')
  useBodyScrollLock(true)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-amber-500/40 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h3 className="font-bold text-white text-base truncate">{t('galleryTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white flex-shrink-0"
            aria-label={tCommon('close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="safe-area-bottom flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2 sm:px-4 sm:py-3">
          <GuildProfileGalleryEditor items={items} />
        </div>
      </div>
    </div>
  )
}
