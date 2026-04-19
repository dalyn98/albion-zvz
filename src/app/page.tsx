import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'
import { Clock, MapPin, ChevronRight, Users, Swords, Flame, Archive } from 'lucide-react'
import Link from 'next/link'
import { isImminent, isEnded } from '@/lib/gather-time'
import { getSession } from '@/lib/session'
import { getAppSetting } from '@/lib/app-settings'

// Homepage reflects the live DB, so never prerender at build — a static
// snapshot would show stale or deleted events.
export const dynamic = 'force-dynamic'

interface EventWithCounts extends Event {
  total: number
  assigned: number
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  denied: '로그인을 취소했습니다.',
  invalid: '잘못된 로그인 요청입니다.',
  state_mismatch: '세션이 만료되어 다시 시도해야 합니다.',
  not_in_guild: 'Discord 서버에 입장한 멤버만 로그인할 수 있습니다.',
  no_identity: 'Discord 사용자 정보를 가져오지 못했습니다.',
  no_role: '필요한 역할이 없어 로그인할 수 없습니다.',
  server_error: '로그인 처리 중 서버 오류가 발생했습니다.',
}

type EventKind = 'imminent' | 'ended' | 'upcoming'

// Default copy shown on the landing hero when the app_settings row is empty.
// Kept in code (not the DB default) so copy tweaks don't require a migration.
export const DEFAULT_LANDING_CTA_TEXT = 'Discord로 로그인하면 이벤트와 파티에 접근할 수 있습니다.'

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
    .select('event_id, slots(id, assigned_discord_id)')
    .in('event_id', ids)

  const totals = new Map<string, { total: number; assigned: number }>()
  for (const p of (parties ?? []) as { event_id: string; slots: { id: string; assigned_discord_id: string | null }[] | null }[]) {
    const current = totals.get(p.event_id) ?? { total: 0, assigned: 0 }
    const slots = p.slots ?? []
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

function classifyEvent(event: Event): EventKind {
  if (event.battle_started_at && isEnded(event.battle_started_at)) return 'ended'
  if (event.battle_started_at || isImminent(event.gather_at)) return 'imminent'
  return 'upcoming'
}

function EventCard({ event, kind }: { event: EventWithCounts; kind: EventKind }) {
  // 카드 상태별 액센트. 테두리+미세한 glow로 상태를 전달하되 hover 시 살짝
  // 떠오르는 느낌을 주기 위해 -translate-y-0.5 + shadow 강화.
  const stateClass =
    kind === 'imminent' && event.battle_started_at
      ? 'border-rose-500/40 hover:border-rose-500/60 hover:shadow-[0_12px_28px_-12px_rgba(244,63,94,0.35)]'
      : kind === 'imminent'
      ? 'border-amber-500/40 hover:border-amber-400/70 hover:shadow-[0_12px_28px_-12px_rgba(245,158,11,0.4)]'
      : kind === 'ended'
      ? 'border-gray-800/80 hover:border-gray-700 opacity-70 hover:opacity-85'
      : 'border-white/5 hover:border-amber-500/40 hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.5)]'
  return (
    <Link
      href={`/events/${event.id}`}
      className={`group block bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-sm border rounded-2xl p-4 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 ${stateClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-white truncate">{event.title}</h2>
            {kind === 'imminent' && event.battle_started_at ? (
              <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                <Swords size={10} />
                전투 진행중
              </span>
            ) : kind === 'imminent' ? (
              <span className="inline-flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                <Flame size={10} />
                전투 임박
              </span>
            ) : kind === 'ended' ? (
              <span className="inline-flex items-center gap-1 bg-gray-700 text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                <Archive size={10} />
                종료
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-gray-300">
              <Clock size={13} className="text-amber-400" />
              {event.gather_time}
            </div>
            <div className="flex items-center gap-1.5 text-gray-300">
              <MapPin size={13} className="text-amber-400" />
              {event.gather_location}
            </div>
          </div>
          {event.total > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Users size={12} />
              신청 {event.assigned}/{event.total}
            </div>
          )}
        </div>
        <ChevronRight
          size={20}
          className="text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1"
        />
      </div>
    </Link>
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>
}) {
  const [{ auth_error }, session] = await Promise.all([searchParams, getSession()])
  const authErrorMessage = auth_error ? AUTH_ERROR_MESSAGES[auth_error] ?? '로그인에 실패했습니다.' : null

  if (!session) {
    const [bannerUrl, ctaText] = await Promise.all([
      getAppSetting('landing_banner_url', ''),
      getAppSetting('landing_cta_text', ''),
    ])
    return (
      <LandingHero
        bannerUrl={bannerUrl}
        ctaText={ctaText || DEFAULT_LANDING_CTA_TEXT}
        authErrorMessage={authErrorMessage}
      />
    )
  }

  const events = await getActiveEvents()

  const imminent: EventWithCounts[] = []
  const ended: EventWithCounts[] = []
  const upcoming: EventWithCounts[] = []
  for (const e of events) {
    const kind = classifyEvent(e)
    if (kind === 'imminent') imminent.push(e)
    else if (kind === 'ended') ended.push(e)
    else upcoming.push(e)
  }

  return (
    <main className="flex-1 px-4 py-6 sm:py-8 max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto w-full space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">전투 일정</h1>
        <p className="text-gray-400 text-sm">이벤트를 선택해 파티 구성을 확인하고 신청하세요.</p>
      </div>

      {authErrorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{authErrorMessage}</p>
        </div>
      )}

      {events.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
          <p className="text-gray-400">등록된 전투가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {imminent.length > 0 && (
            <Section
              title="전투 임박"
              icon={<Flame size={16} className="text-amber-400" />}
              titleClass="text-amber-300"
            >
              {imminent.map((event) => (
                <EventCard key={event.id} event={event} kind="imminent" />
              ))}
            </Section>
          )}

          {ended.length > 0 && (
            <Section
              title="종료된 전투"
              icon={<Archive size={16} className="text-gray-500" />}
              titleClass="text-gray-400"
            >
              {ended.map((event) => (
                <EventCard key={event.id} event={event} kind="ended" />
              ))}
            </Section>
          )}

          {upcoming.length > 0 && (
            <Section title="예정된 전투" titleClass="text-gray-400">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} kind="upcoming" />
              ))}
            </Section>
          )}
        </div>
      )}
    </main>
  )
}

function Section({
  title,
  icon,
  titleClass,
  children,
}: {
  title: string
  icon?: React.ReactNode
  titleClass: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className={`text-sm font-bold ${titleClass}`}>{title}</h2>
      </div>
      <div className="space-y-3 xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0 2xl:grid-cols-3">
        {children}
      </div>
    </section>
  )
}

function LandingHero({
  bannerUrl,
  ctaText,
  authErrorMessage,
}: {
  bannerUrl: string
  ctaText: string
  authErrorMessage: string | null
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
          <span>Discord로 로그인</span>
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
