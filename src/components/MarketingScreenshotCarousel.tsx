'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MarketingScreenshotImage } from '@/lib/marketing-screenshots'

interface Props {
  images: MarketingScreenshotImage[]
  fallbackLabel: string
  aspect?: '16/9' | '4/3'
}

const ASPECT_CLASS: Record<NonNullable<Props['aspect']>, string> = {
  '16/9': 'aspect-video',
  '4/3': 'aspect-[4/3]',
}

export default function MarketingScreenshotCarousel({
  images,
  fallbackLabel,
  aspect = '16/9',
}: Props) {
  const t = useTranslations('publicMarketing')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; scrollLeft: number; active: boolean; moved: boolean }>({
    startX: 0,
    scrollLeft: 0,
    active: false,
    moved: false,
  })
  const [activeIndex, setActiveIndex] = useState(0)

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

  const aspectClass = ASPECT_CLASS[aspect]

  if (images.length === 0) {
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
          className={`${aspectClass} overflow-x-auto snap-x snap-mandatory rounded-xl border border-gray-800 select-none ${
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
                  className="w-full h-full object-cover pointer-events-none"
                />
              </div>
            ))}
          </div>
        </div>
        {showControls && activeIndex > 0 && (
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex - 1)}
            aria-label={t('carouselPrev')}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        {showControls && activeIndex < images.length - 1 && (
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex + 1)}
            aria-label={t('carouselNext')}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <ChevronRight size={18} />
          </button>
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
                idx === activeIndex
                  ? 'w-6 bg-amber-400'
                  : 'w-1.5 bg-gray-600 hover:bg-gray-500'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
