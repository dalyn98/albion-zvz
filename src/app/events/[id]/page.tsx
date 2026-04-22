import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Event, PartyWithSlots } from '@/types'
import { SLOT_ROLES, type SlotRole } from '@/types'
import { getAppSetting } from '@/lib/app-settings'
import EventPartyGrid from '@/components/EventPartyGrid'
import EventSlotSidebar from '@/components/EventSlotSidebar'
import EventGuestInviteManager from '@/components/EventGuestInviteManager'
import AutoRefresh from '@/components/AutoRefresh'
import { Clock, MapPin, ArrowLeft, Swords, Info, Pencil } from 'lucide-react'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'
import { formatGatherTimeFor, isEnded } from '@/lib/gather-time'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { getLocale } from '@/lib/locale'
import { listEventGuestTokens } from '@/app/actions/event-invites'

function formatStartedAt(iso: string): string {
  // "MM-DD HH:mm" → "MM/DD HH:mm" (KST, via formatDateTimeShort).
  return formatDateTimeShort(iso).replace('-', '/')
}

export const dynamic = 'force-dynamic'

async function getEvent(id: string) {
  const [{ data: event }, { data: parties }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle(),
    supabase.from('parties').select('*, slots(*)').eq('event_id', id).order('party_number'),
  ])

  const sorted = (parties ?? []).map((p) => ({
    ...p,
    slots: [...(p.slots ?? [])]
      .filter((s) => !s.is_hidden)
      .sort((a, b) => a.slot_number - b.slot_number),
  })) as PartyWithSlots[]

  return {
    event: event as Event | null,
    parties: sorted,
  }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ event, parties }, session, t, locale, cdBadgeRolesRaw] = await Promise.all([
    getEvent(id),
    getSession(),
    getTranslations('event'),
    getLocale(),
    getAppSetting('cd_badge_roles', '["Dps"]'),
  ])

  // 파싱 실패/잘못된 shape 은 기본값(`["Dps"]`) 으로 degrade — 설정 페이지에서
  // 동일 파서를 쓰기 때문에 양쪽이 같은 방식으로 동작한다.
  const slotRoleSet: ReadonlySet<string> = new Set(SLOT_ROLES)
  let cdBadgeRoles: SlotRole[] = ['Dps']
  try {
    const parsed = JSON.parse(cdBadgeRolesRaw)
    if (Array.isArray(parsed)) {
      cdBadgeRoles = parsed.filter(
        (v): v is SlotRole => typeof v === 'string' && slotRoleSet.has(v),
      )
    }
  } catch {
    // 손상된 값 — 기본값 유지.
  }

  if (!event) notFound()

  const displayGatherTime = event.gather_at
    ? formatGatherTimeFor(locale, event.gather_at)
    : event.gather_time

  const totalSlots = parties.reduce((sum, p) => sum + p.slots.length, 0)
  const totalAssigned = parties.reduce(
    (sum, p) => sum + p.slots.filter((s) => s.assigned_discord_id).length,
    0,
  )

  // Collect both assigned + pending-request IDs and bomb squad caller IDs so
  // avatars render for all member-facing states (assigned, pending, caller).
  const memberIds = parties.flatMap((p) => [
    ...p.slots.map((s) => s.assigned_discord_id),
    ...p.slots.map((s) => s.requested_discord_id),
    p.caller_discord_id,
  ])
  const avatarMap = await getAvatarsByDiscordIds(
    memberIds.filter((id): id is string => !!id),
  )
  const avatars = Object.fromEntries(avatarMap)

  const loginHref = `/api/auth/discord/start?returnTo=${encodeURIComponent(`/events/${id}`)}`

  // Edit entry point for non-admin event creators — admins already reach this
  // via the sidebar's admin nav. Members with the event-creator role only see
  // the button on events they own (matches `requireEventCreatorForEvent`).
  const canEdit =
    !!session &&
    (session.isAdmin ||
      (session.canCreateEvents && !!event.created_by && event.created_by === session.discordId))

  // 게스트 초대 관리도 같은 권한(관리자 or 이벤트 작성자). 서버에서 미리
  // 활성 토큰 목록을 로드해 모달이 즉시 열리도록 prefill.
  const origin = (process.env.APP_URL ?? '').replace(/\/$/, '')
  const { tokens: guestTokens } = canEdit
    ? await listEventGuestTokens(id)
    : { tokens: [] as const }

  // Pre-battle & in-progress battles get live polling. Once the battle is
  // finished (battle_started_at + 1h), slots are frozen — no reason to keep
  // hammering the DB or draining mobile batteries.
  const shouldPoll = !event.battle_started_at || !isEnded(event.battle_started_at)

  return (
    <div className="flex-1 w-full max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 py-6 sm:py-8 flex flex-col lg:flex-row lg:items-start lg:gap-6 space-y-4 lg:space-y-0">
      {shouldPoll && <AutoRefresh intervalMs={15000} />}
      <main className="flex-1 min-w-0 space-y-6 sm:space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>

        <div className={`bg-gray-900 border rounded-2xl p-4 sm:p-6 space-y-3 sm:space-y-4 ${
          event.battle_started_at ? 'border-rose-500/40' : 'border-gray-700'
        }`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-gray-400 text-sm font-semibold uppercase tracking-widest mb-1">
                {t('info')}
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{event.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              {event.battle_started_at && (
                <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-sm font-bold px-2.5 py-1 rounded-full">
                  <Swords size={12} />
                  {t('inProgress', { time: formatStartedAt(event.battle_started_at) })}
                </span>
              )}
              {canEdit && (
                <EventGuestInviteManager
                  eventId={id}
                  initialTokens={[...(guestTokens ?? [])]}
                  origin={origin}
                />
              )}
              {canEdit && (
                <Link
                  href={`/admin/dashboard/events/${id}`}
                  className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-300 text-sm font-bold px-2.5 py-1 rounded-full transition-colors"
                  aria-label={t('editAria')}
                >
                  <Pencil size={12} />
                  {t('edit')}
                </Link>
              )}
            </div>
          </div>
          {event.battle_started_at && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 flex items-start gap-2">
              <Info size={14} className="text-rose-300 flex-shrink-0 mt-0.5" />
              <p className="text-rose-200 text-sm leading-relaxed">
                {t.rich('startedNotice', {
                  bold: (chunks) => <span className="font-bold">{chunks}</span>,
                })}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-3 sm:gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-300">
              <Clock size={14} className="text-amber-400" />
              {displayGatherTime}
            </div>
            <div className="flex items-center gap-1.5 text-gray-300">
              <MapPin size={14} className="text-amber-400" />
              {event.gather_location}
            </div>
            {totalSlots > 0 && (
              <div className="text-gray-400">
                {t('applicants', { assigned: totalAssigned, total: totalSlots })}
              </div>
            )}
          </div>
          {event.special_notes && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-300 text-sm font-semibold whitespace-pre-wrap">
                📢 {event.special_notes}
              </p>
            </div>
          )}
        </div>

        <div className="lg:hidden">
          <EventSlotSidebar placement="mobile" parties={parties} avatars={avatars} />
        </div>

        <EventPartyGrid
          parties={parties}
          currentDiscordId={session?.discordId ?? null}
          loginHref={loginHref}
          battleStarted={!!event.battle_started_at}
          isAdmin={session?.isAdmin ?? false}
          eventId={id}
          eventCreatedBy={event.created_by ?? null}
          avatars={avatars}
          cdBadgeRoles={cdBadgeRoles}
        />
      </main>

      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0">
        <EventSlotSidebar placement="desktop" parties={parties} avatars={avatars} />
      </aside>
    </div>
  )
}
