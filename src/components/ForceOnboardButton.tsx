'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw } from 'lucide-react'
import { resetMemberAlbionOnboarding } from '@/app/actions/stats-admin'
import { useToast } from './ToastProvider'

interface Props {
  discordId: string
  username: string
}

// 관리자 전용: 특정 멤버의 albion 필드를 모두 NULL 로 리셋해서 다음 사이트
// 방문 때 온보딩 모달을 다시 띄우게 한다. 버튼 → 확인 → 서버 액션 → refresh.
export default function ForceOnboardButton({ discordId, username }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true)
      // 3초 안에 다시 누르면 실행. 이후엔 confirm 상태 해제.
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    setConfirming(false)
    startTransition(async () => {
      const res = await resetMemberAlbionOnboarding(discordId)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${username} 님의 온보딩을 초기화했습니다`)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors flex-shrink-0 ${
        confirming
          ? 'bg-rose-500/20 border border-rose-500/60 text-rose-200'
          : 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300'
      } disabled:opacity-50`}
      title="이 멤버의 알비온 인증 정보를 지우고 다음 방문 때 온보딩을 다시 띄웁니다"
    >
      {isPending ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <RotateCcw size={11} />
      )}
      {confirming ? '한 번 더' : '재온보딩'}
    </button>
  )
}
