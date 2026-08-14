import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import OnboardGuildList from '@/components/OnboardGuildList'

export const dynamic = 'force-dynamic'

const ONBOARD_GUILDS_COOKIE = 'discord_onboard_guilds'

interface OnboardGuild {
  id: string
  name: string
  icon: string | null
}

// bot-callback 의 errorRedirect 가 install_error=<reason> 쿼리로 돌아오는데
// 페이지에서 사용자에게 노출하지 않으면 무한 루프처럼 보인다. reason 코드별
// 원인이 다르므로 그대로 표시해 디버깅/사용자 안내 둘 다 한다.
const INSTALL_ERROR_KEYS: Record<string, string> = {
  denied: 'installErrorDenied',
  invalid: 'installErrorInvalid',
  state_missing: 'installErrorStateMissing',
  guild_id_missing: 'installErrorGuildIdMissing',
  code_missing: 'installErrorCodeMissing',
  state_mismatch: 'installErrorStateMismatch',
  guild_mismatch: 'installErrorGuildMismatch',
  bot_not_in_guild: 'installErrorBotNotInGuild',
  identity_unknown: 'installErrorIdentityUnknown',
  not_owner: 'installErrorNotOwner',
  server_error: 'installErrorServerError',
}

interface OnboardPageProps {
  searchParams: Promise<{ install_error?: string }>
}

// 온보딩 랜딩: 유저가 "서버 관리" 권한을 가진 Discord 길드 목록을 콜백이 쿠키에
// 심어 두었으므로 여기서 그대로 읽어 표시한다. 쿠키는 30분 TTL 이라 너무 오래
// 방치하면 다시 로그인 버튼으로 리프레시하게 유도.
export default async function OnboardPage({ searchParams }: OnboardPageProps) {
  const session = await getSession()
  if (!session) {
    redirect('/login?returnTo=%2Fonboard')
  }

  const t = await getTranslations('onboard')
  const cookieStore = await cookies()
  const rawCookie = cookieStore.get(ONBOARD_GUILDS_COOKIE)?.value
  const params = await searchParams
  const installErrorRaw = params.install_error
  const installErrorKey = installErrorRaw ? INSTALL_ERROR_KEYS[installErrorRaw] : null
  const installErrorMessage = installErrorKey
    ? t(installErrorKey)
    : installErrorRaw
      ? t('installErrorUnknown', { reason: installErrorRaw })
      : null

  // 위저드 도중 닫고 돌아온 사용자: 본인이 시작한 pending tenant 가 있으면
  // 다시 install 을 누르지 않고도 이어서 진행할 수 있도록 CTA 노출.
  const db = getAdminClient()
  const { data: pendingRows } = await db
    .from('tenants')
    .select('id, name')
    .eq('created_by_discord_id', session.discordId)
    .eq('status', 'pending')
    .order('bot_installed_at', { ascending: false })
    .limit(5)
  const pendingTenants = (pendingRows ?? []) as Array<{ id: string; name: string }>

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

  const pendingResumeBlock = pendingTenants.length > 0 && (
    <section className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/5 px-4 py-4">
      <h2 className="text-sm font-semibold text-emerald-200">
        {t('pendingResumeTitle')}
      </h2>
      <p className="mt-1 text-xs text-emerald-100/70">
        {t('pendingResumeDescription')}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {pendingTenants.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm text-white">{p.name}</span>
            <Link
              href={`/onboard/setup/${p.id}`}
              className="shrink-0 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold px-3 py-1.5"
            >
              {t('pendingResumeButton')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )

  // 쿠키가 없거나 비어있으면 expired 화면. 단, pending tenant 가 있으면 위저드를
  // 이어서 진행할 수 있도록 resume CTA 만 노출.
  if (guilds.length === 0) {
    const emptyTitle = rawCookie ? t('emptyTitle') : t('expiredTitle')
    const emptyDescription = rawCookie ? t('emptyDescription') : t('expiredDescription')
    if (pendingTenants.length > 0) {
      return (
        <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 sm:py-14">
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{t('title')}</h1>
            <p className="text-sm text-gray-400">{t('description')}</p>
          </div>
          {installErrorMessage && (
            <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {installErrorMessage}
            </div>
          )}
          {pendingResumeBlock}
          <div className="mt-4 text-center">
            <Link
              href="/login?returnTo=%2Fonboard"
              className="inline-block px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 text-sm font-semibold"
            >
              {t('relogin')}
            </Link>
          </div>
        </main>
      )
    }
    return (
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-12 sm:py-16">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-white">{emptyTitle}</h1>
          <p className="text-sm text-gray-400">{emptyDescription}</p>
          <p className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100/80">
            {t('serverListTroubleshooting')}
          </p>
          <Link
            href="/login?returnTo=%2Fonboard"
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] text-[#fff] text-sm font-semibold"
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
      {installErrorMessage && (
        <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {installErrorMessage}
        </div>
      )}
      <section className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{t('serverListTitle')}</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">{t('serverListDescription')}</p>
        <p className="mt-2 text-xs leading-relaxed text-amber-200/80">
          {t('serverListTroubleshooting')}
        </p>
      </section>
      {pendingResumeBlock}
      <OnboardGuildList
        guilds={guilds}
        installLabel={t('installButton')}
      />
    </main>
  )
}
