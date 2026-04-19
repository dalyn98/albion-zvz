'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { getLocalizedItemName } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'

interface Props {
  itemId: string | null
  itemName: string | null
  size?: number
  // hoverPreview가 true면 마우스오버 시 확대 이미지 팝오버를 띄운다.
  // 사이드바/리스트 등 작은 썸네일에서 실제 아이템을 크게 확인하고 싶을 때 사용.
  hoverPreview?: boolean
  previewSize?: number
}

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIGZpbGw9IiMyMjI4MzYiLz48dGV4dCB4PSIzMCIgeT0iMzUiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM0QjU1NjMiPj88L3RleHQ+PC9zdmc+'

const PREVIEW_GAP = 8

export default function ItemImage({
  itemId,
  itemName,
  size = 60,
  hoverPreview = false,
  previewSize = 160,
}: Props) {
  const t = useTranslations('common')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  // Prefer the bundled localized name so previously-saved events display in
  // the current locale; stored itemName is still used when the id is not
  // bundled (e.g., free-text items or older data).
  const displayName = getLocalizedItemName(itemId, locale, itemName)
  const [errored, setErrored] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const src =
    itemId && !errored
      ? `https://render.albiononline.com/v1/item/${itemId}.png`
      : PLACEHOLDER

  // 썸네일의 위치 기준으로 viewport 안에 들어오는 방향으로 팝오버를 배치.
  // scroll 컨테이너의 overflow 클립을 피하려고 portal + fixed 좌표를 사용한다.
  function placePreview() {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const rightEdge = rect.right + PREVIEW_GAP + previewSize
    const showOnLeft = rightEdge > window.innerWidth
    const rawLeft = showOnLeft
      ? rect.left - PREVIEW_GAP - previewSize
      : rect.right + PREVIEW_GAP
    const rawTop = rect.top + rect.height / 2 - previewSize / 2

    setCoords({
      left: Math.max(8, Math.min(window.innerWidth - previewSize - 8, rawLeft)),
      top: Math.max(8, Math.min(window.innerHeight - previewSize - 8, rawTop)),
    })
  }

  function handleEnter() {
    if (!hoverPreview) return
    placePreview()
    setHovered(true)
  }

  function handleLeave() {
    if (!hoverPreview) return
    setHovered(false)
  }

  return (
    <>
      <div
        ref={wrapperRef}
        className="relative rounded-md overflow-hidden bg-gray-800 border border-gray-700 flex-shrink-0"
        style={{ width: size, height: size }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
      >
        <Image
          src={src}
          alt={displayName ?? t('item')}
          fill
          className="object-contain p-0.5 pixel-img"
          onError={() => setErrored(true)}
          unoptimized
        />
      </div>

      {hoverPreview && hovered && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[100] rounded-xl overflow-hidden bg-gray-900/95 border border-white/10 shadow-2xl backdrop-blur-md pointer-events-none"
              style={{
                top: coords.top,
                left: coords.left,
                width: previewSize,
                height: previewSize,
              }}
              aria-hidden="true"
            >
              <Image
                src={src}
                alt=""
                fill
                className="object-contain p-3 pixel-img"
                unoptimized
              />
              {displayName && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pt-4 pb-1.5">
                  <p className="text-white text-[13px] font-medium text-center truncate">{displayName}</p>
                </div>
              )}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
