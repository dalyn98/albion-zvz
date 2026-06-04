import Image from 'next/image'
import { getTranslations } from 'next-intl/server'

interface Props {
  src?: string
  alt?: string
  caption: string
  width?: number
  height?: number
}

export default async function DocImage({ src, alt, caption, width = 1280, height = 720 }: Props) {
  if (src) {
    return (
      <figure className="my-6">
        <div className="relative rounded-lg overflow-hidden border border-amber-900/30 bg-gray-950">
          <Image
            src={src}
            alt={alt ?? caption}
            width={width}
            height={height}
            className="w-full h-auto"
          />
        </div>
        <figcaption className="mt-2 text-sm text-gray-400 italic">{caption}</figcaption>
      </figure>
    )
  }
  const t = await getTranslations('docsHome')
  return (
    <figure className="my-6">
      <div className="aspect-video bg-gray-900/50 border border-dashed border-amber-700/40 rounded-lg flex items-center justify-center px-6 py-10">
        <span className="text-gray-500 text-sm text-center leading-relaxed">
          {t('imageSlotPlaceholder', { caption })}
        </span>
      </div>
    </figure>
  )
}
