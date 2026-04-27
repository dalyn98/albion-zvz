'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, RotateCcw } from 'lucide-react'
import { resetMemberAlbionOnboarding } from '@/app/actions/stats-admin'
import { useToast } from './ToastProvider'

interface Props {
  discordId: string
  username: string
  // 인증 완료 멤버를 리셋하는 경우 — 누름 한 번만으로 끝나면 실수 위험이
  // 큰 액션(이미 정상 인증된 데이터 삭제)이라 idle 라벨/툴팁만 살짝 강한
  // 표현으로 바꾼다. 핵심 흐름(2-탭 confirm)은 동일.
  isVerified?: boolean
}

// 관리자 전용: 특정 멤버의 albion 필드를 모두 NULL 로 리셋해서 다음 사이트
// 방문 때 온보딩 모달을 다시 띄우게 한다. 버튼 → 확인 → 서버 액션 → refresh.
export default function ForceOnboardButton({ discordId, username, isVerified = false }: Props) {
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('forceOnboardButton')
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
      toast.success(t('successMessage', { username }))
      router.refresh()
    })
  }

  const idleLabel = isVerified ? t('idleVerified') : t('idle')
  const tooltip = isVerified ? t('tooltipVerified') : t('tooltip')

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors flex-shrink-0 ${
        confirming
          ? 'bg-rose-500/20 border border-rose-500/60 text-rose-200'
          : isVerified
          ? 'bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-200'
          : 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300'
      } disabled:opacity-50`}
      title={tooltip}
    >
      {isPending ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <RotateCcw size={11} />
      )}
      {confirming ? t('confirm') : idleLabel}
    </button>
  )
}
