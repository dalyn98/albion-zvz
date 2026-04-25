import { Megaphone } from 'lucide-react'

interface Props {
  message: string
  imageUrl?: string
}

// Admin-authored notice banner shared between the events list and the regear
// page. Always rendered (no dismiss). 사용자가 임의로 닫지 못하게 해 운영 공지가
// 항상 보이도록 한다 — 닫기를 추가하려면 별도 정책이 정해진 뒤 다시 이 파일에
// 상호작용을 추가하는 게 안전.
export default function DismissibleNoticeBanner({ message, imageUrl }: Props) {
  const trimmed = message.trim()
  const trimmedImage = (imageUrl ?? '').trim()
  if (!trimmed && !trimmedImage) return null

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <Megaphone size={16} className="text-amber-300 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          {trimmed && (
            <p className="text-amber-100 text-sm whitespace-pre-wrap break-words">
              {trimmed}
            </p>
          )}
          {trimmedImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={trimmedImage}
              alt=""
              className="w-full h-auto rounded-md border border-amber-500/20 block"
            />
          )}
        </div>
      </div>
    </div>
  )
}
