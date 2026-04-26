import { ImageIcon } from 'lucide-react'

interface ScreenshotPlaceholderProps {
  // 라벨은 "어떤 페이지/기능의 스크린샷인지" 를 명시한다 — 나중에 실제 이미지로
  // 교체할 때 어디에 어떤 캡쳐가 들어가야 하는지 즉시 알 수 있도록.
  label: string
  // tailwind aspect-* 유틸 키워드 ('video' | 'square' | '4/3' 등) 또는 직접 비율.
  aspect?: 'video' | 'square' | '4/3' | '16/9' | '3/2'
}

// 마케팅 페이지의 스크린샷 자리. 멤버 게이트 때문에 Playwright 로 캡쳐할 수
// 없는 화면(/admin/dashboard, /regear, /shop 등) 은 이 placeholder 로 자리만
// 잡아두고 사용자가 PNG 를 떨어뜨리면 즉시 교체할 수 있게 한다.
export default function ScreenshotPlaceholder({ label, aspect = 'video' }: ScreenshotPlaceholderProps) {
  const aspectClass =
    aspect === 'video' ? 'aspect-video' :
    aspect === 'square' ? 'aspect-square' :
    aspect === '4/3' ? 'aspect-[4/3]' :
    aspect === '3/2' ? 'aspect-[3/2]' :
    'aspect-[16/9]'
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
