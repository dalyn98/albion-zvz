import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import OnboardGuildList from '@/components/OnboardGuildList'

export const dynamic = 'force-dynamic'

const ONBOARD_GUILDS_COOKIE = 'discord_onboard_guilds'

interface OnboardGuild {
  id: string
  name: string
  icon: string | null
}

// 온보딩 랜딩: 유저가 "서버 관리" 권한을 가진 Discord 길드 목록을 콜백이 쿠키에
// 심어 두었으므로 여기서 그대로 읽어 표시한다. 쿠키는 30분 TTL 이라 너무 오래
// 방치하면 다시 로그인 버튼으로 리프레시하게 유도.
export default async function OnboardPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/onboard')
  }

  const t = await getTranslations('onboard')
  const cookieStore = await cookies()
  const rawCookie = cookieStore.get(ONBOARD_GUILDS_COOKIE)?.value

  let guilds: OnboardGuild[] = []
  if (rawCookie) {
    try {
      const parsed = JSON.parse(rawCookie) as unknown
      if (Array.isArray(parsed)) {
        guilds = parsed
          .filter((g): g is OnboardGuild => {
            if (!g || typeof g !== 'object') return false
            const rec = g as Record<string, unknown>
            return typeof rec.id === 'string' && typeof rec.name === 'string'
          })
          .map((g) => ({ id: g.id, name: g.name, icon: g.icon ?? null }))
      }
    } catch {
      guilds = []
    }
  }

  // 쿠키가 없거나 비어있으면 expired 화면. 다시 로그인으로 리프레시.
  if (guilds.length === 0) {
    return (
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-12 sm:py-16">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-white">{t('expiredTitle')}</h1>
          <p className="text-sm text-gray-400">{t('expiredDescription')}</p>
          <Link
            href="/api/auth/discord/start?returnTo=/onboard"
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] text-white text-sm font-semibold"
          >
            {t('relogin')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 sm:py-14">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-sm text-gray-400">{t('description')}</p>
      </div>
      <OnboardGuildList
        guilds={guilds}
        installLabel={t('installButton')}
      />
    </main>
  )
}
