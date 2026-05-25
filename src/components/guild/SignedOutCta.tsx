// 길드 공개 페이지에서 비로그인 사용자에게 보여주는 작은 안내 배너.
// "로그인하면 본인 활동도 볼 수 있다" — 디자인 톤을 깨지 않게 단일 라인으로 유지.

import { LogIn } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ACCENT_CLASS_MAP } from '@/lib/guild-profile'
import { buildDiscordStartHref } from '@/lib/discord-auth-url'

type Accent = (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]

interface Props {
  accent: Accent
  // 로그인 후 다시 돌아올 경로 (현재 길드 페이지). API 라우트가 returnTo
  // 쿼리를 그대로 redirect 에 사용한다.
  returnTo: string
  localLoginHref?: string | null
  isOtherGuildSession?: boolean
}

export default async function SignedOutCta({
  accent,
  returnTo,
  localLoginHref,
  isOtherGuildSession = false,
}: Props) {
  const t = await getTranslations('publicGuildProfile')
  const href = buildDiscordStartHref({ returnTo, forceConsent: isOtherGuildSession })
  return (
    <div
      className={`rounded-lg border ${accent.border} bg-gray-900/40 backdrop-blur-sm px-4 py-3 flex items-center gap-3 flex-wrap`}
    >
      <span className={`shrink-0 ${accent.heading}`}>
        <LogIn size={14} />
      </span>
      <p className="text-gray-300 text-xs flex-1 min-w-0">
        {isOtherGuildSession ? t('otherGuildCtaText') : t('signedOutCtaText')}
      </p>
      {localLoginHref && (
        <a
          href={localLoginHref}
          className={`shrink-0 inline-flex items-center gap-1.5 ${accent.heading} ${accent.border} border bg-gray-900/60 hover:bg-gray-900 text-xs font-semibold px-3.5 py-2.5 rounded-lg transition-colors min-h-[40px]`}
        >
          <LogIn size={12} />
          {t('localGuildLoginCta')}
        </a>
      )}
      <a
        href={href}
        className={`shrink-0 inline-flex items-center gap-1.5 ${accent.heading} ${accent.border} border bg-gray-900/60 hover:bg-gray-900 text-xs font-semibold px-3.5 py-2.5 rounded-lg transition-colors min-h-[40px]`}
      >
        <LogIn size={12} />
        {isOtherGuildSession ? t('switchDiscordCtaLink') : t('signedOutCtaLink')}
      </a>
    </div>
  )
}
