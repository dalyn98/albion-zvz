'use client'

import Image from 'next/image'
import { useState } from 'react'

interface Props {
  spellId: string | null
  size?: number
  title?: string
}

const PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIGZpbGw9IiMyMjI4MzYiLz48dGV4dCB4PSIzMCIgeT0iMzUiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM0QjU1NjMiPj88L3RleHQ+PC9zdmc+'

export default function SpellImage({ spellId, size = 24, title }: Props) {
  const [errored, setErrored] = useState(false)
  const src =
    spellId && !errored
      ? `https://render.albiononline.com/v1/spell/${spellId}.png`
      : PLACEHOLDER
  return (
    <div
      className="relative rounded-md overflow-hidden bg-gray-800 border border-gray-700 flex-shrink-0"
      style={{ width: size, height: size }}
      title={title ?? spellId ?? undefined}
    >
      <Image
        src={src}
        alt={spellId ?? ''}
        fill
        className="object-contain p-0.5 pixel-img"
        onError={() => setErrored(true)}
        unoptimized
      />
    </div>
  )
}
