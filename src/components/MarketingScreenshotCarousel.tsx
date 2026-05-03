'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react'
import {
  uploadMarketingScreenshot,
  deleteMarketingScreenshot,
} from '@/app/actions/marketing-screenshots'
import type {
  MarketingScreenshotImage,
  MarketingScreenshotKey,
} from '@/lib/marketing-screenshots'

interface Props {
  images: MarketingScreenshotImage[]
  fallbackLabel: string
  aspect?: '16/9' | '4/3'
  // 슈퍼어드민이 랜딩에서 직접 업로드/삭제 가능. slot 없으면 비활성.
  editable?: boolean
  slot?: MarketingScreenshotKey
}

const ASPECT_CLASS: Record<NonNullable<Props['aspect']>, string> = {
  '16/9': 'aspect-video',
  '4/3': 'aspect-[4/3]',
}

const ACCEPT = 'image/png,image/jpeg,image/webp'

export default function MarketingScreenshotCarousel({
  images,
  fallbackLabel,
  aspect = '16/9',
  editable = false,
  slot,
}: Props) {
  const t = useTranslations('publicMarketing')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ startX: number; scrollLeft: number; active: boolean; moved: boolean }>({
    startX: 0,
    scrollLeft: 0,
    active: false,
    moved: false,
  })
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const canEdit = editable && !!slot

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || images.length <= 1) return

    function update() {
      if (!scroller) return
      const { scrollLeft, clientWidth } = scroller
      const idx = Math.round(scrollLeft / clientWidth)
      setActiveIndex(Math.min(Math.max(0, idx), images.length - 1))
    }

    scroller.addEventListener('scroll', update, { passive: true })
    update()
    return () => scroller.removeEventListener('scroll', update)
  }, [images.length])

  // 삭제 후 activeIndex 가 범위 밖으로 가지 않도록 렌더 시 보정.
  const safeIndex = images.length === 0
    ? 0
    : Math.min(Math.max(0, activeIndex), images.length - 1)

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const scroller = scrollerRef.current
    if (!scroller) return
    dragRef.current = {
      startX: e.pageX,
      scrollLeft: scroller.scrollLeft,
      active: true,
      moved: false,
    }
    scroller.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const scroller = scrollerRef.current
    const drag = dragRef.current
    if (!scroller || !drag.active) return
    const dx = e.pageX - drag.startX
    if (Math.abs(dx) > 4) drag.moved = true
    scroller.scrollLeft = drag.scrollLeft - dx
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current.active = false
    try {
      scrollerRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      // noop — pointer may already be released
    }
  }

  function scrollToIndex(idx: number) {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollTo({ left: scroller.clientWidth * idx, behavior: 'smooth' })
  }

  function handleFiles(files: FileList | null) {
    if (!canEdit || !files || files.length === 0 || !slot) return
    setError(null)
    const arr = Array.from(files)
    startTransition(async () => {
      for (const file of arr) {
        const fd = new FormData()
        fd.set('slot', slot)
        fd.set('file', file)
        const { error } = await uploadMarketingScreenshot(fd)
        if (error) {
          setError(error)
          break
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  function handleDeleteCurrent() {
    if (!canEdit) return
    const target = images[safeIndex]
    if (!target) return
    if (!window.confirm('이 이미지를 삭제하시겠습니까?')) return
    setError(null)
    startTransition(async () => {
      const { error } = await deleteMarketingScreenshot(target.id)
      if (error) setError(error)
    })
  }

  const aspectClass = ASPECT_CLASS[aspect]

  if (images.length === 0) {
    if (canEdit) {
      return (
        <div className="space-y-1.5">
          <label
            htmlFor={`mkt-upload-${slot}`}
            className={`${aspectClass} w-full rounded-xl border-2 border-dashed border-amber-500/50 bg-gradient-to-br from-amber-500/5 to-gray-950 flex items-center justify-center text-center px-6 cursor-pointer hover:border-amber-400 hover:bg-amber-500/10 transition-colors`}
          >
            <input
              ref={fileInputRef}
              id={`mkt-upload-${slot}`}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              disabled={isPending}
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="space-y-2">
              {isPending ? (
                <Loader2 size={28} className="mx-auto text-amber-300 animate-spin" />
              ) : (
                <Plus size={28} className="mx-auto text-amber-300" />
              )}
              <p className="text-xs text-amber-200 font-semibold">
                {isPending ? '업로드 중…' : '클릭해서 스크린샷 업로드'}
              </p>
              <p className="text-[11px] text-gray-500 font-mono">{fallbackLabel}</p>
            </div>
          </label>
          {error && (
            <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1">
              {error}
            </p>
          )}
        </div>
      )
    }
    return (
      <div
        className={`${aspectClass} w-full rounded-xl border border-dashed border-gray-700 bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center text-center px-6`}
      >
        <div className="space-y-2">
          <ImageIcon size={28} className="mx-auto text-gray-600" />
          <p className="text-xs text-gray-500 font-mono">{fallbackLabel}</p>
        </div>
      </div>
    )
  }

  const showControls = images.length > 1

  return (
    <div className="space-y-2">
      <div className="relative group">
        <div
          ref={scrollerRef}
          className={`${aspectClass} overflow-x-auto snap-x snap-mandatory rounded-xl border border-gray-800 bg-gray-950 select-none ${
            showControls ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex h-full">
            {images.map((img) => (
              <div
                key={img.id}
                className="w-full h-full flex-shrink-0 snap-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt ?? fallbackLabel}
                  draggable={false}
                  loading="lazy"
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
            ))}
          </div>
        </div>
        {showControls && safeIndex > 0 && (
          <button
            type="button"
            onClick={() => scrollToIndex(safeIndex - 1)}
            aria-label={t('carouselPrev')}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        {showControls && safeIndex < images.length - 1 && (
          <button
            type="button"
            onClick={() => scrollToIndex(safeIndex + 1)}
            aria-label={t('carouselNext')}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <ChevronRight size={18} />
          </button>
        )}
        {canEdit && (
          <div className="absolute top-2 right-2 flex gap-1.5">
            <label
              htmlFor={`mkt-upload-${slot}`}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold shadow-lg transition-colors ${
                isPending
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-500 text-gray-950 hover:bg-amber-400 cursor-pointer'
              }`}
              aria-label="이미지 추가"
            >
              <input
                ref={fileInputRef}
                id={`mkt-upload-${slot}`}
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                disabled={isPending}
                onChange={(e) => handleFiles(e.target.files)}
              />
              {isPending ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Plus size={11} />
              )}
              <span>추가</span>
            </label>
            <button
              type="button"
              onClick={handleDeleteCurrent}
              disabled={isPending}
              aria-label="현재 이미지 삭제"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold shadow-lg bg-rose-500/90 text-white hover:bg-rose-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={11} />
              <span>삭제</span>
            </button>
          </div>
        )}
      </div>
      {showControls && (
        <div className="flex items-center justify-center gap-1.5">
          {images.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => scrollToIndex(idx)}
              aria-label={t('carouselDot', { n: idx + 1 })}
              className={`h-1.5 rounded-full transition-all ${
                idx === safeIndex
                  ? 'w-6 bg-amber-400'
                  : 'w-1.5 bg-gray-600 hover:bg-gray-500'
              }`}
            />
          ))}
        </div>
      )}
      {canEdit && error && (
        <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1">
          {error}
        </p>
      )}
    </div>
  )
}
