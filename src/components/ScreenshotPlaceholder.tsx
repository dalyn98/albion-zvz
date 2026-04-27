import { ImageIcon } from 'lucide-react'

interface ScreenshotPlaceholderProps {
  label: string
  aspect?: 'video' | 'square' | '4/3' | '16/9' | '3/2'
  src?: string | null
}

export default function ScreenshotPlaceholder({
  label,
  aspect = 'video',
  src,
}: ScreenshotPlaceholderProps) {
  const aspectClass =
    aspect === 'video' ? 'aspect-video' :
    aspect === 'square' ? 'aspect-square' :
    aspect === '4/3' ? 'aspect-[4/3]' :
    aspect === '3/2' ? 'aspect-[3/2]' :
    'aspect-[16/9]'

  if (src) {
    return (
      // 마케팅 페이지에서만 사용. next/image 의 placeholder/blur 가 필요해지면
      // 그때 next/image 로 교체해도 동선이 동일하다 (아래 placeholder 와 props 호환).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        loading="lazy"
        className={`${aspectClass} w-full rounded-xl border border-gray-800 object-cover`}
      />
    )
  }

  return (
    <div
      className={`${aspectClass} w-full rounded-xl border border-dashed border-gray-700 bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center text-center px-6`}
    >
      <div className="space-y-2">
        <ImageIcon size={28} className="mx-auto text-gray-600" />
        <p className="text-xs text-gray-500 font-mono">{label}</p>
      </div>
    </div>
  )
}
