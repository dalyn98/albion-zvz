'use client'

import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'

type AlbionItemImageProps = Omit<ImageProps, 'src' | 'alt' | 'onError'> & {
  src: string
  alt: string
}

const ITEM_IMAGE_FALLBACK =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCA5NiA5NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHJ4PSIxMiIgZmlsbD0iIzExMTgyNyIvPjxyZWN0IHg9IjE0IiB5PSIxNCIgd2lkdGg9IjY4IiBoZWlnaHQ9IjY4IiByeD0iOCIgZmlsbD0iIzFGMjkzNyIgc3Ryb2tlPSIjMzc0MTUwIi8+PHBhdGggZD0iTTM1IDYxTDYxIDM1IiBzdHJva2U9IiM2Qjc0ODAiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTYwIDU3TDY4IDY1IiBzdHJva2U9IiM2Qjc0ODAiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHRleHQgeD0iNDgiIHk9IjgxIiBmb250LXNpemU9IjEwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNkI3NDgwIj5pdGVtPC90ZXh0Pjwvc3ZnPg=='

export default function AlbionItemImage({ src, alt, unoptimized = true, ...props }: AlbionItemImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = failedSrc === src

  return (
    <Image
      {...props}
      src={failed ? ITEM_IMAGE_FALLBACK : src}
      alt={alt}
      unoptimized={unoptimized}
      onError={() => setFailedSrc(src)}
    />
  )
}
