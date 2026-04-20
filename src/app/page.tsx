import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'
import { getTranslations } from 'next-intl/server'
import { formatGatherTimeFor, isImminent, isEnded } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import { getSession } from '@/lib/session'
import { getAppSetting } from '@/lib/app-settings'
import HomeEventTabs, { type HomeEventCardData, type HomeEventKind } from '@/components/HomeEventTabs'

// Homepage reflects the live DB, so never prerender at build — a static
// snapshot would show stale or deleted events.
export const dynamic = 'force-dynamic'

interface EventWithCounts extends Event {
  total: number
  assigned: number
}

// Scheduled kinds only; wins/losses are determined by event.outcome directly.
type ScheduledKind = 'imminent' | 'ended' | 'upcoming'

// Maps the auth_error query param the Discord callback sets on redirect
// to translation keys under `auth.error`.
const AUTH_ERROR_KEY_MAP: Record<string, string> = {
  denied: 'denied',
  invalid: 'invalid',
  state_mismatch: 'stateMismatch',
  not_in_guild: 'notInGuild',
  no_identity: 'noIdentity',
  no_role: 'noRole',
  server_error: 'serverError',
}

async function getActiveEvents(): Promise<EventWithCounts[]> {
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('gather_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (!events || events.length === 0) return []

  const ids = (events as Event[]).map((e) => e.id)
  const { data: parties } = await supabase
    .from('parties')
    .select('event_id, slots(id, assigned_discord_id, is_hidden)')
    .in('event_id', ids)

  const totals = new Map<string, { total: number; assigned: number }>()
  for (const p of (parties ?? []) as { event_id: string; slots: { id: string; assigned_discord_id: string | null; is_hidden: boolean }[] | null }[]) {
    const current = totals.get(p.event_id) ?? { total: 0, assigned: 0 }
    const slots = (p.slots ?? []).filter((s) => !s.is_hidden)
    current.total += slots.length
    current.assigned += slots.filter((s) => s.assigned_discord_id).length
    totals.set(p.event_id, current)
  }

  return (events as Event[]).map((e) => ({
    ...e,
    total: totals.get(e.id)?.total ?? 0,
    assigned: totals.get(e.id)?.assigned ?? 0,
  }))
}

function classifyScheduled(event: Event): ScheduledKind {
  if (event.battle_started_at && isEnded(event.battle_started_at)) return 'ended'
  if (event.battle_started_at || isImminent(event.gather_at)) return 'imminent'
  return 'upcoming'
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>
}) {
  const [{ auth_error }, session, t, locale] = await Promise.all([
    searchParams,
    getSession(),
    getTranslations(),
    getLocale(),
  ])

  // Prefer gather_at (ISO) for locale-aware formatting; fall back to stored
  // gather_time (always Korean) for legacy rows that predate gather_at.
  const displayGatherTime = (event: Event): string =>
    event.gather_at ? formatGatherTimeFor(locale, event.gather_at) : event.gather_time

  const authErrorMessage = auth_error
    ? t(`auth.error.${AUTH_ERROR_KEY_MAP[auth_error] ?? 'default'}`)
    : null

  if (!session) {
    const [bannerUrl, ctaText] = await Promise.all([
      getAppSetting('landing_banner_url', ''),
      getAppSetting('landing_cta_text', ''),
    ])
    return (
      <LandingHero
        bannerUrl={bannerUrl}
        ctaText={ctaText || t('landing.defaultCta')}
        authErrorMessage={authErrorMessage}
        loginLabel={t('landing.discordLogin')}
      />
    )
  }

  const events = await getActiveEvents()

  // Fetch opponent guild summaries for finalized events so the win/loss tabs
  // can display "vs GuildA, GuildB · 3 battles" per card. Skip when there are
  // no finalized events.
  const finalizedIds = events.filter((e) => e.outcome).map((e) => e.id)
  const battleMap = new Map<string, { opponents: string[]; count: number }>()
  if (finalizedIds.length > 0) {
    const { data: battles } = await supabase
      .from('event_battles')
      .select('event_id, opponent_guild, battle_number')
      .in('event_id', finalizedIds)
      .order('battle_number', { ascending: true })
    for (const b of (battles ?? []) as { event_id: string; opponent_guild: string }[]) {
      const cur = battleMap.get(b.event_id) ?? { opponents: [], count: 0 }
      if (!cur.opponents.includes(b.opponent_guild)) cur.opponents.push(b.opponent_guild)
      cur.count += 1
      battleMap.set(b.event_id, cur)
    }
  }

  const toCard = (event: EventWithCounts, kind: HomeEventKind): HomeEventCardData => {
    const battleInfo = battleMap.get(event.id)
    return {
      id: event.id,
      title: event.title,
      gather_location: event.gather_location,
      displayGatherTime: displayGatherTime(event),
      total: event.total,
      assigned: event.assigned,
      kind,
      battleStarted: !!event.battle_started_at,
      opponentGuilds: battleInfo ? battleInfo.opponents.join(', ') : null,
      battleCount: battleInfo?.count ?? 0,
    }
  }

  const scheduled: HomeEventCardData[] = []
  const wins: HomeEventCardData[] = []
  const losses: HomeEventCardData[] = []
  for (const e of events) {
    if (e.outcome === 'win') wins.push(toCard(e, 'win'))
    else if (e.outcome === 'loss') losses.push(toCard(e, 'loss'))
    else scheduled.push(toCard(e, classifyScheduled(e)))
  }

  return (
    <main className="flex-1 px-4 py-6 sm:py-8 max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto w-full space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('home.title')}</h1>
        <p className="text-gray-400 text-sm">{t('home.subtitle')}</p>
      </div>

      {authErrorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{authErrorMessage}</p>
        </div>
      )}

      {events.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
          <p className="text-gray-400">{t('home.empty')}</p>
        </div>
      ) : (
        <HomeEventTabs scheduled={scheduled} wins={wins} losses={losses} />
      )}
    </main>
  )
}

function LandingHero({
  bannerUrl,
  ctaText,
  authErrorMessage,
  loginLabel,
}: {
  bannerUrl: string
  ctaText: string
  authErrorMessage: string | null
  loginLabel: string
}) {
  const loginHref = '/api/auth/discord/start?returnTo=/'
  // 사이드바까지 덮는 풀-뷰포트 오버레이. `fixed inset-0`로 상위 레이아웃의 사이드바와
  // 메인 컨테이너를 모두 가리고, 배너는 CSS 배경으로 깔아서 그 위에 로그인 카드만 띄운다.
  const backgroundStyle = bannerUrl
    ? {
        backgroundImage: `url(${bannerUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-[#0b0d12]"
      style={backgroundStyle}
    >
      {/* 배너 위로 가독성 확보용 vignette. 상단은 살짝 투명, 하단으로 갈수록 짙어져
          문구가 잘 읽히도록 한다. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/85" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_70%)]" />

      <div className="relative z-10 w-full max-w-sm text-center space-y-8">
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
            Menhera
          </h1>
          <p className="text-gray-200/90 text-sm leading-relaxed drop-shadow whitespace-pre-wrap">
            {ctaText}
          </p>
        </div>

        <a
          href={loginHref}
          className="group relative inline-flex items-center justify-center gap-2 w-full bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold py-3.5 rounded-xl shadow-[0_10px_30px_-10px_rgba(88,101,242,0.6)] hover:shadow-[0_14px_36px_-10px_rgba(88,101,242,0.75)] hover:-translate-y-0.5 transition-all duration-200"
        >
          <DiscordIcon />
          <span>{loginLabel}</span>
        </a>

        {authErrorMessage && (
          <p className="text-red-300 text-xs drop-shadow">{authErrorMessage}</p>
        )}
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] text-gray-400/80 drop-shadow z-10 tracking-wide">
        Made By Monkku
      </p>
    </div>
  )
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}
