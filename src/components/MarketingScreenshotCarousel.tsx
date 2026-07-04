'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  BarChart3,
  CalendarDays,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Coins,
  Hammer,
  LayoutTemplate,
  Plus,
  ShoppingBag,
  Trash2,
  Loader2,
} from 'lucide-react'
import {
  uploadMarketingScreenshot,
  deleteMarketingScreenshot,
} from '@/app/actions/marketing-screenshots'
import { useConfirm } from '@/components/ConfirmDialog'
import { cx, mediaOutlineClass, pressScaleClass } from '@/components/ui-patterns'
import type {
  MarketingScreenshotImage,
  MarketingScreenshotKey,
} from '@/lib/marketing-screenshots'

interface Props {
  images?: MarketingScreenshotImage[]
  fallbackLabel: string
  aspect?: '16/9' | '4/3'
  priorityFirstImage?: boolean
  // 슈퍼어드민이 랜딩에서 직접 업로드/삭제 가능. slot 없으면 비활성.
  editable?: boolean
  slot?: MarketingScreenshotKey
}

const ASPECT_CLASS: Record<NonNullable<Props['aspect']>, string> = {
  '16/9': 'aspect-video',
  '4/3': 'aspect-[4/3]',
}

const ACCEPT = 'image/png,image/jpeg,image/webp'

const PREVIEW_CONFIG: Record<MarketingScreenshotKey, {
  Icon: typeof ImageIcon
  badgeClass: string
  iconClass: string
  barClass: string
  chipClass: string
}> = {
  events: {
    Icon: CalendarDays,
    badgeClass: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
    iconClass: 'text-amber-300',
    barClass: 'bg-amber-300/70',
    chipClass: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
  },
  regear: {
    Icon: Coins,
    badgeClass: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
    iconClass: 'text-emerald-300',
    barClass: 'bg-emerald-300/70',
    chipClass: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
  },
  shop: {
    Icon: ShoppingBag,
    badgeClass: 'border-violet-400/30 bg-violet-400/10 text-violet-100',
    iconClass: 'text-violet-300',
    barClass: 'bg-violet-300/70',
    chipClass: 'border-violet-400/20 bg-violet-400/10 text-violet-100',
  },
  stats: {
    Icon: BarChart3,
    badgeClass: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
    iconClass: 'text-sky-300',
    barClass: 'bg-sky-300/70',
    chipClass: 'border-sky-400/20 bg-sky-400/10 text-sky-100',
  },
  craft: {
    Icon: Hammer,
    badgeClass: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
    iconClass: 'text-rose-300',
    barClass: 'bg-rose-300/70',
    chipClass: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
  },
  builds: {
    Icon: LayoutTemplate,
    badgeClass: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-100',
    iconClass: 'text-indigo-300',
    barClass: 'bg-indigo-300/70',
    chipClass: 'border-indigo-400/20 bg-indigo-400/10 text-indigo-100',
  },
}

function EmptyMarketingPreview({
  aspectClass,
  badge,
  chips,
  fallbackLabel,
  slot,
}: {
  aspectClass: string
  badge: string
  chips: [string, string, string]
  fallbackLabel: string
  slot?: MarketingScreenshotKey
}) {
  const config = slot ? PREVIEW_CONFIG[slot] : null
  const Icon = config?.Icon ?? ImageIcon
  const barClass = config?.barClass ?? 'bg-gray-500/70'
  const chipClass = config?.chipClass ?? 'border-gray-600 bg-gray-800 text-gray-300'
  const badgeClass = config?.badgeClass ?? 'border-gray-600 bg-gray-800 text-gray-300'
  const iconClass = config?.iconClass ?? 'text-gray-500'

  return (
    <div
      role="img"
      aria-label={fallbackLabel}
      className={`${aspectClass} relative w-full overflow-hidden rounded-xl border border-gray-800 bg-gray-950 px-5 py-4`}
    >
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${badgeClass}`}>
            <Icon size={12} className={iconClass} />
            {badge}
          </span>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-rose-300/70" />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold leading-snug text-white sm:text-base">
            {fallbackLabel}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                <div className={`h-1.5 rounded-full ${barClass} ${idx === 0 ? 'w-10/12' : idx === 1 ? 'w-7/12' : 'w-5/12'}`} />
                <div className="mt-2 space-y-1">
                  <div className="h-1 rounded-full bg-white/15" />
                  <div className="h-1 w-2/3 rounded-full bg-white/10" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2].map((idx) => (
              <span key={idx} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${chipClass}`}>
                <CheckCircle2 size={10} />
                {chips[idx]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MarketingScreenshotCarousel({
  images,
  fallbackLabel,
  aspect = '16/9',
  priorityFirstImage = false,
  editable = false,
  slot,
}: Props) {
  const router = useRouter()
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
  const askConfirm = useConfirm()
  const safeImages = images ?? []

  const canEdit = editable && !!slot

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || safeImages.length <= 1) return

    function update() {
      if (!scroller) return
      const { scrollLeft, clientWidth } = scroller
      const idx = Math.round(scrollLeft / clientWidth)
      setActiveIndex(Math.min(Math.max(0, idx), safeImages.length - 1))
    }

    scroller.addEventListener('scroll', update, { passive: true })
    update()
    return () => scroller.removeEventListener('scroll', update)
  }, [safeImages.length])

  // 삭제 후 activeIndex 가 범위 밖으로 가지 않도록 렌더 시 보정.
  const safeIndex = safeImages.length === 0
    ? 0
    : Math.min(Math.max(0, activeIndex), safeImages.length - 1)

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
      let hasError = false
      for (const file of arr) {
        const fd = new FormData()
        fd.set('slot', slot)
        fd.set('file', file)
        const { error } = await uploadMarketingScreenshot(fd)
        if (error) {
          setError(error)
          hasError = true
          break
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (!hasError) router.refresh()
    })
  }

  async function handleDeleteCurrent() {
    if (!canEdit) return
    const target = safeImages[safeIndex]
    if (!target) return
    if (target.source === 'fallback') return
    const ok = await askConfirm({ body: t('carouselDeleteConfirm'), destructive: true })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const { error } = await deleteMarketingScreenshot(target.id)
      if (error) setError(error)
      else router.refresh()
    })
  }

  const aspectClass = ASPECT_CLASS[aspect]

  if (safeImages.length === 0) {
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
                {isPending ? t('carouselUploading') : t('carouselUploadPrompt')}
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
        className="w-full"
      >
        <EmptyMarketingPreview
          aspectClass={aspectClass}
          badge={t('carouselPreviewBadge')}
          chips={[
            t('carouselPreviewChipLive'),
            t('carouselPreviewChipOps'),
            t('carouselPreviewChipData'),
          ]}
          fallbackLabel={fallbackLabel}
          slot={slot}
        />
      </div>
    )
  }

  const showControls = safeImages.length > 1
  const currentImage = safeImages[safeIndex]
  const canDeleteCurrent = canEdit && currentImage?.source === 'database'

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
            {safeImages.map((img, idx) => (
              <div
                key={img.id}
                className="relative w-full h-full flex-shrink-0 snap-center"
              >
                <Image
                  src={img.url}
                  alt={img.alt ?? fallbackLabel}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  // 페이지가 LCP 후보로 지정한 캐러셀만 preload한다.
                  priority={priorityFirstImage && idx === 0}
                  draggable={false}
                  className={cx('pointer-events-none object-contain', mediaOutlineClass)}
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
            className={cx(
              'absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-black/80 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 group-hover:opacity-100 sm:flex',
              pressScaleClass,
            )}
          >
            <ChevronLeft size={18} />
          </button>
        )}
        {showControls && safeIndex < safeImages.length - 1 && (
          <button
            type="button"
            onClick={() => scrollToIndex(safeIndex + 1)}
            aria-label={t('carouselNext')}
            className={cx(
              'absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-black/80 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 group-hover:opacity-100 sm:flex',
              pressScaleClass,
            )}
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
              aria-label={t('carouselUploadLabel')}
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
              <span>{t('carouselUpload')}</span>
            </label>
            {canDeleteCurrent && (
              <button
                type="button"
                onClick={handleDeleteCurrent}
                disabled={isPending}
                aria-label={t('carouselDeleteLabel')}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold shadow-lg bg-rose-500/90 text-white hover:bg-rose-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={11} />
                <span>{t('carouselDelete')}</span>
              </button>
            )}
          </div>
        )}
      </div>
      {showControls && (
        <div className="flex items-center justify-center gap-1.5">
          {safeImages.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => scrollToIndex(idx)}
              aria-label={t('carouselDot', { n: idx + 1 })}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/5"
            >
              <span
                className={`h-1.5 rounded-full transition-[background-color,width] duration-150 ease-out ${
                  idx === safeIndex
                    ? 'w-6 bg-amber-400'
                    : 'w-1.5 bg-gray-600'
                }`}
              />
            </button>
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
