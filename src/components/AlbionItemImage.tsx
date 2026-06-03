'use client'

import Image, { type ImageProps } from 'next/image'
import { useEffect, useMemo, useState } from 'react'

type AlbionItemImageProps = Omit<ImageProps, 'src' | 'alt' | 'onError'> & {
  src: string
  fallbackSrcs?: readonly string[]
  alt: string
}

const ITEM_IMAGE_FALLBACK =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCA5NiA5NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHJ4PSIxMiIgZmlsbD0iIzExMTgyNyIvPjxyZWN0IHg9IjE0IiB5PSIxNCIgd2lkdGg9IjY4IiBoZWlnaHQ9IjY4IiByeD0iOCIgZmlsbD0iIzFGMjkzNyIgc3Ryb2tlPSIjMzc0MTUwIi8+PHBhdGggZD0iTTM1IDYxTDYxIDM1IiBzdHJva2U9IiM2Qjc0ODAiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTYwIDU3TDY4IDY1IiBzdHJva2U9IiM2Qjc0ODAiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHRleHQgeD0iNDgiIHk9IjgxIiBmb250LXNpemU9IjEwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNkI3NDgwIj5pdGVtPC90ZXh0Pjwvc3ZnPg=='

const IMAGE_LOAD_TIMEOUT_MS = 7000

export default function AlbionItemImage({
  src,
  fallbackSrcs = [],
  ...props
}: AlbionItemImageProps) {
  const sourceKey = [src, ...fallbackSrcs].join('\u0000')
  const candidateSrcs = useMemo(() => {
    const candidates: string[] = []
    const add = (candidate: string) => {
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate)
    }
    for (const candidate of sourceKey.split('\u0000')) add(candidate)
    add(ITEM_IMAGE_FALLBACK)
    return candidates
  }, [sourceKey])

  return <AlbionItemImageAttempt key={sourceKey} candidateSrcs={candidateSrcs} {...props} />
}

type AlbionItemImageAttemptProps = Omit<AlbionItemImageProps, 'src' | 'fallbackSrcs'> & {
  candidateSrcs: readonly string[]
}

function AlbionItemImageAttempt({
  candidateSrcs,
  alt,
  unoptimized = true,
  onLoad,
  ...props
}: AlbionItemImageAttemptProps) {
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const activeSrc = candidateSrcs[Math.min(candidateIndex, candidateSrcs.length - 1)] ?? ITEM_IMAGE_FALLBACK

  useEffect(() => {
    if (activeSrc === ITEM_IMAGE_FALLBACK || loadedSrc === activeSrc) return
    const timer = window.setTimeout(() => {
      setCandidateIndex((index) => Math.min(index + 1, candidateSrcs.length - 1))
    }, IMAGE_LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [activeSrc, candidateSrcs.length, loadedSrc])

  return (
    <Image
      {...props}
      src={activeSrc}
      alt={alt}
      unoptimized={unoptimized}
      onLoad={(event) => {
        setLoadedSrc(activeSrc)
        onLoad?.(event)
      }}
      onError={() => {
        setCandidateIndex((index) => Math.min(index + 1, candidateSrcs.length - 1))
      }}
    />
  )
}
