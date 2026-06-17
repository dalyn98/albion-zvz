import { getAdminClient } from '@/lib/supabase-admin'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import type { Event, PartyWithSlots } from '@/types'
import { SLOT_ROLES, type SlotRole } from '@/types'
import { getAppSetting } from '@/lib/app-settings'
import EventPartyGrid from '@/components/EventPartyGrid'
import EventSlotSidebar from '@/components/EventSlotSidebar'
import EventGuestInviteManager from '@/components/EventGuestInviteManager'
import EventGuestProfileGate from '@/components/EventGuestProfileGate'
import TentativeSignupSection from '@/components/TentativeSignupSection'
import EventMyStatusCard, { type EventMyStatusTone } from '@/components/EventMyStatusCard'
import EventBuildSheetSummary from '@/components/EventBuildSheetSummary'
import BuildSheetApplicationPanel from '@/components/BuildSheetApplicationPanel'
import BuildSheetAssignmentBoard from '@/components/BuildSheetAssignmentBoard'
import { listTentativeSignupsForGuild } from '@/lib/event-tentative-signups'
import AutoRefresh from '@/components/AutoRefresh'
import { Clock, MapPin, ArrowLeft, Swords, Info, Pencil, FileText, LogIn, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId, getPrimaryTenantId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { getAvatarsByDiscordIds, getUsernamesByDiscordIds } from '@/lib/discord-avatar'
import { formatGatherTimeFor, isEnded } from '@/lib/gather-time'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { getLocale } from '@/lib/locale'
import { getTenantTimezone } from '@/lib/timezone-server'
import { listEventGuestTokens } from '@/app/actions/event-invites'
import { classifyHost, resolveTenantBySlug } from '@/lib/tenant-resolver'
import { resolveAlbionDisplayName } from '@/lib/albion-display-name'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { loadGuildProfileSettings } from '@/lib/guild-profile'
import {
  getBuildSheetAssignedPartyNumbers,
  loadBuildSheetEventState,
} from '@/lib/build-sheet-data'
import {
  getEventGuestDisplayNamesByDiscordIds,
  getEventGuestProfile,
} from '@/lib/event-guest-profile'
import { canApplyToEventSlots, getEventInteractionSession } from '@/lib/event-session'
import { buildDiscordStartHref } from '@/lib/discord-auth-url'
import { resolveEventGuestInviteScope, resolvePublicEventPageGuildId } from '@/lib/event-guest-auth'
import { getAlbionEventAccessGateState } from '@/lib/albion-identity'
import { loadEventRoleExperienceCounts } from '@/lib/event-role-experience-server'
import { canRequestRegearFromEventStatus } from '@/lib/regear-eligible-events'
import { PARTY_WITH_SLOTS_SELECT } from '@/lib/event-query-selects'

function formatStartedAt(iso: string, tz: string): string {
  // "MM-DD HH:mm" → "MM/DD HH:mm" (in tenant tz).
  return formatDateTimeShort(iso, tz).replace('-', '/')
}

function requestOriginFromHeaders(headersList: Headers): string {
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? ''
  if (!host) return ''
  const proto = headersList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`.replace(/\/$/, '')
}

function buildAlbionOnboardingHref(returnTo: string): string {
  return `/onboarding/albion?return=${encodeURIComponent(returnTo)}`
}

const IN_PROGRESS_EVENT_POLL_MS = 45_000
const IMMINENT_EVENT_POLL_MS = 60_000
const UPCOMING_EVENT_POLL_MS = 120_000
const FAR_FUTURE_EVENT_POLL_MS = 5 * 60_000
const IMMINENT_EVENT_WINDOW_MS = 30 * 60_000
const UPCOMING_EVENT_WINDOW_MS = 2 * 60 * 60_000

function resolveEventPollIntervalMs(event: Pick<Event, 'battle_started_at' | 'gather_at'>): number {
  if (event.battle_started_at) return IN_PROGRESS_EVENT_POLL_MS
  if (!event.gather_at) return UPCOMING_EVENT_POLL_MS

  const gatherAt = new Date(event.gather_at).getTime()
  if (!Number.isFinite(gatherAt)) return UPCOMING_EVENT_POLL_MS

  const msUntilGather = gatherAt - Date.now()
  if (msUntilGather > UPCOMING_EVENT_WINDOW_MS) return FAR_FUTURE_EVENT_POLL_MS
  if (msUntilGather > IMMINENT_EVENT_WINDOW_MS) return UPCOMING_EVENT_POLL_MS
  return IMMINENT_EVENT_POLL_MS
}

function EventAccessGate({
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  title: string
  description: string
  primaryAction?: { href: string; label: string }
  secondaryAction?: { href: string; label: string }
}) {
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-10 sm:py-16">
      <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-6 sm:p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
          <ShieldAlert size={24} />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">{title}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-400">
          {description}
        </p>
        {(primaryAction || secondaryAction) && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {primaryAction && (
              <Link
                href={primaryAction.href}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400"
              >
                <LogIn size={15} />
                {primaryAction.label}
              </Link>
            )}
            {secondaryAction && (
              <Link
                href={secondaryAction.href}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition-colors hover:border-amber-500/50 hover:text-amber-200"
              >
                {secondaryAction.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'

// Discord/Slack 임베드 봇은 비로그인으로 페이지를 fetch 하므로 host 헤더의
// 서브도메인으로 tenant 를 잡아내야 한다. 세션 기반 해소는 비로그인 봇에서
// primary tenant 로 폴백해 다른 길드의 배너가 임베드되는 사고가 난다.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const [{ id }, headersList, tMeta] = await Promise.all([
    params,
    headers(),
    getTranslations('meta'),
  ])
  const classification = classifyHost(headersList.get('host'))
  const tenant =
    classification.kind === 'tenant'
      ? await resolveTenantBySlug(classification.slug)
      : null
  // 캐노니컬 루트/프리뷰/로컬 호스트에서 직접 /events/<id> 를 열어도 OG 가
  // 깨지지 않도록 root layout 의 default metadata 를 그대로 유지한다.
  if (!tenant) return {}

  const db = getAdminClient()
  const [{ data: eventRow }, displayName, settings] = await Promise.all([
    db
      .from('events')
      .select('title, status')
      .eq('guild_id', tenant.tenantId)
      .eq('id', id)
      .maybeSingle(),
    resolveAlbionDisplayName(tenant.tenantId, tenant.slug, tenant.name),
    loadGuildProfileSettings(tenant.tenantId),
  ])

  // Draft 이벤트는 페이지 본문에서 notFound() — 메타도 노출하지 않는다.
  const eventTitle =
    eventRow && eventRow.status !== 'draft'
      ? (eventRow.title as string | null) ?? null
      : null

  const ogTitle = eventTitle
    ? tMeta('ogEventTitle', { event: eventTitle, name: displayName })
    : tMeta('ogGuildTitle', { name: displayName })
  const ogDescription = tMeta('ogEventDescription', { name: displayName })
  const ogImages = settings.bannerUrl
    ? [{ url: settings.bannerUrl, alt: displayName }]
    : undefined
  const canonicalUrl = `https://${tenant.slug}.albion-guildmanager.com/events/${id}`

  return {
    title: ogTitle,
    description: ogDescription,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'article',
      siteName: tMeta('ogSiteName'),
      title: ogTitle,
      description: ogDescription,
      url: canonicalUrl,
      ...(ogImages && { images: ogImages }),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
      ...(ogImages && { images: ogImages.map((i) => i.url) }),
    },
  }
}

async function getEvent(id: string, guildId: string) {
  const db = getAdminClient()
  const [{ data: event }, { data: parties }] = await Promise.all([
    db
      .from('events')
      .select(
        'id, title, gather_time, gather_at, gather_location, special_notes, battle_started_at, created_by, status, category, recruitment_mode, regear_policy',
      )
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle(),
    db
      .from('parties')
      .select(PARTY_WITH_SLOTS_SELECT)
      .eq('guild_id', guildId)
      .eq('event_id', id)
      .order('party_number'),
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
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ invite?: string | string[] }>
}) {
  const [{ id }, sp, headersList, session] = await Promise.all([
    params,
    searchParams,
    headers(),
    getSession(),
  ])
  const rawInvite = Array.isArray(sp.invite) ? sp.invite[0] : sp.invite
  const inviteToken = rawInvite?.trim() || null
  const db = getAdminClient()
  const [sessionGuildId, publicPageGuildId, guestInviteScope] = await Promise.all([
    session ? getSessionGuildId(session) : Promise.resolve(null),
    resolvePublicEventPageGuildId(db, {
      eventId: id,
      inviteToken,
      hostHeader: headersList.get('host'),
    }),
    resolveEventGuestInviteScope(db, {
      eventId: id,
      inviteToken,
    }),
  ])
  const hasGuestInvite = guestInviteScope?.eventId === id
  if (session?.isGuest && session.eventScope && session.eventScope !== id && !hasGuestInvite) {
    redirect(`/events/${session.eventScope}`)
  }
  // Public event pages should prefer a valid invite/host tenant over an
  // unrelated existing session. Otherwise a guest scoped to an older event can
  // see this public page as "logged in" and hit server-side slot scope guards.
  const guildId = guestInviteScope?.guildId ?? publicPageGuildId ?? sessionGuildId ?? await getPrimaryTenantId()
  const [
    { event, parties },
    t,
    tRole,
    locale,
    cdBadgeRolesRaw,
    autoRegearRaw,
    tz,
    tentativeRes,
  ] = await Promise.all([
    getEvent(id, guildId),
    getTranslations('event'),
    getTranslations('slotRole'),
    getLocale(),
    getAppSetting('cd_badge_roles', '["EngageDps","BrawlerDps"]', guildId),
    getAppSetting('auto_regear_enabled', 'false', guildId),
    getTenantTimezone(guildId),
    listTentativeSignupsForGuild(id, guildId),
  ])
  const autoRegearEnabled = autoRegearRaw === 'true'

  // 파싱 실패/잘못된 shape 은 기본값으로 degrade — 설정 페이지에서 동일 파서를
  // 쓰기 때문에 양쪽이 같은 방식으로 동작한다.
  const slotRoleSet: ReadonlySet<string> = new Set(SLOT_ROLES)
  let cdBadgeRoles: SlotRole[] = ['EngageDps', 'BrawlerDps']
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

  // Draft 이벤트는 공개 URL 로 접근 못하게 숨김 — 관리자 편집기로만 볼 수 있다.
  // admin 이라도 draft 미리보기 용도로 쓰고 싶다면 관리자 경로 (/admin/dashboard/events/[id])
  // 로 들어가야 한다. 여기서 굳이 우회 열어주지 않는 편이 실수 공개를 방지한다.
  if (!event || event.status === 'draft') notFound()
  const eventReturnPath = inviteToken
    ? `/events/${id}?invite=${encodeURIComponent(inviteToken)}`
    : `/events/${id}`
  const onboardingHref = buildAlbionOnboardingHref(eventReturnPath)
  const albionEventGate = session && sessionGuildId === guildId
    ? await getAlbionEventAccessGateState({
        discordId: session.discordId,
        guildId,
        isMember: session.isMember === true,
        isAdmin: session.isAdmin === true,
      })
    : null
  const allianceEventAllowed = albionEventGate?.allianceEventAllowed ?? false
  const memberOnboardingRequired = albionEventGate?.memberOnboardingRequired ?? false
  const memberEventVerificationRequired =
    albionEventGate?.memberEventVerificationRequired ?? false
  if (memberOnboardingRequired) {
    redirect(onboardingHref)
  }
  const interactionSession = getEventInteractionSession({
    session: memberEventVerificationRequired ? null : session,
    sessionGuildId,
    eventGuildId: guildId,
    eventId: id,
    allowAllianceParticipant: allianceEventAllowed,
  })
  const isBombSquadCallerOnly =
    interactionSession?.isBombSquadCaller === true &&
    !interactionSession.isMember &&
    !interactionSession.isAdmin &&
    !interactionSession.isGuest &&
    !allianceEventAllowed
  const canApplyToSlots = canApplyToEventSlots(interactionSession, allianceEventAllowed)

  const displayGatherTime = event.gather_at
    ? formatGatherTimeFor(locale, event.gather_at, tz)
    : event.gather_time

  const totalSlots = parties.reduce((sum, p) => sum + p.slots.length, 0)
  const totalAssigned = parties.reduce(
    (sum, p) => sum + p.slots.filter((s) => s.assigned_discord_id).length,
    0,
  )

  const tentativeRows = tentativeRes.rows

  const loginHref = buildDiscordStartHref({ returnTo: eventReturnPath, invite: inviteToken })
  const localLoginEnabled =
    (await getAppSetting('local_guild_accounts_enabled', 'false', guildId)) === 'true' &&
    (await getAppSetting('local_guild_invite_hash', '', guildId)).trim().length > 0
  const localLoginHref = localLoginEnabled
    ? `/guild-login?return=${encodeURIComponent(eventReturnPath)}`
    : null
  const scopedGuestAccessAllowed =
    interactionSession?.isGuest === true && interactionSession.eventScope === id
  const regularAccessAllowed =
    !!interactionSession &&
    !interactionSession.isGuest &&
    (interactionSession.isMember ||
      interactionSession.isAdmin ||
      interactionSession.isBombSquadCaller ||
      allianceEventAllowed)
  const shouldOfferAlbionOnboarding =
    !!session &&
    sessionGuildId === guildId &&
    (memberEventVerificationRequired ||
      (session.isAllianceCandidate === true &&
        !session.isMember &&
        !session.isAdmin &&
        !session.isGuest &&
        !session.isBombSquadCaller &&
        !allianceEventAllowed))
  if (!hasGuestInvite && !scopedGuestAccessAllowed && !regularAccessAllowed) {
    return (
      <EventAccessGate
        title={
          shouldOfferAlbionOnboarding
            ? t('albionVerificationRequiredTitle')
            : session
              ? t('privateNoAccessTitle')
              : t('privateTitle')
        }
        description={
          shouldOfferAlbionOnboarding
            ? t('albionVerificationRequiredBody')
            : session
              ? t('privateNoAccessBody')
              : t('privateBody')
        }
        primaryAction={
          shouldOfferAlbionOnboarding
            ? { href: onboardingHref, label: t('albionVerificationRequiredAction') }
            : !session
              ? { href: loginHref, label: t('privateLogin') }
              : undefined
        }
        secondaryAction={
          !shouldOfferAlbionOnboarding && !session && localLoginHref
            ? { href: localLoginHref, label: t('privateLocalLogin') }
            : undefined
        }
      />
    )
  }

  // Edit entry point for delegated event managers and event owners.
  // Plain event creators only see it on events they own; EVENT_MANAGE officers
  // can manage existing events in the guild.
  const canEdit =
    !!interactionSession &&
    (interactionSession.isAdmin ||
      sessionHas(interactionSession, CAP.EVENT_MANAGE) ||
      (sessionCanCreateOrManageEvents(interactionSession) &&
        !!event.created_by &&
        event.created_by === interactionSession.discordId))
  const canManageTentativeSignups = canEdit
  const buildSheetMode =
    event.recruitment_mode === 'build_sheet' || event.recruitment_mode === 'hybrid'

  // Collect both assigned + pending-request IDs and bomb squad caller IDs so
  // avatars render for all member-facing states (assigned, pending, caller).
  // This stays after the access gate so private event probes do not pay for
  // member maps, guest display names, or role history.
  const memberIds = parties.flatMap((p) => [
    ...p.slots.map((s) => s.assigned_discord_id),
    ...p.slots.map((s) => s.requested_discord_id),
    p.caller_discord_id,
  ])
  const memberIdList = [
    ...memberIds.filter((memberId): memberId is string => !!memberId),
    ...tentativeRows.map((r) => r.discord_id),
  ]

  const [
    avatarMap,
    usernameMap,
    eventGuestNameMap,
    roleExperienceCounts,
    buildSheetManageableParties,
    buildSheetState,
    guestTokenResult,
    guestProfile,
  ] = await Promise.all([
    getAvatarsByDiscordIds(guildId, memberIdList),
    getUsernamesByDiscordIds(guildId, memberIdList),
    getEventGuestDisplayNamesByDiscordIds(guildId, id, memberIdList),
    loadEventRoleExperienceCounts({
      db,
      guildId,
      currentEventId: id,
      parties,
    }),
    buildSheetMode && interactionSession
      ? getBuildSheetAssignedPartyNumbers(id, guildId, interactionSession.discordId)
      : Promise.resolve([] as number[]),
    buildSheetMode
      ? loadBuildSheetEventState(id, guildId, {
          includeApplications: !!interactionSession,
        })
      : Promise.resolve(null),
    canEdit
      ? listEventGuestTokens(id)
      : Promise.resolve({ tokens: [] as const }),
    interactionSession?.isGuest && interactionSession.eventScope === id
      ? getEventGuestProfile(guildId, id, interactionSession.discordId)
      : Promise.resolve(null),
  ])
  for (const [discordId, displayName] of eventGuestNameMap) {
    usernameMap.set(discordId, displayName)
  }
  const avatars = Object.fromEntries(avatarMap)
  const usernames = Object.fromEntries(usernameMap)
  const myBuildSheetApplication =
    interactionSession && buildSheetState
      ? buildSheetState.applications.find(
          (app) => app.applicant_discord_id === interactionSession.discordId,
        ) ?? null
      : null
  const canManageBuildSheet = canEdit || buildSheetManageableParties.length > 0

  // 게스트 초대 관리도 같은 권한(관리자 or 이벤트 작성자). 서버에서 미리
  // 활성 토큰 목록을 로드해 모달이 즉시 열리도록 prefill.
  const origin = requestOriginFromHeaders(headersList)
  const { tokens: guestTokens } = guestTokenResult
  const shouldShowGuestProfileGate =
    (interactionSession?.isGuest && interactionSession.eventScope === id && !guestProfile) ||
    (hasGuestInvite && (!interactionSession || interactionSession.isGuest))

  // Poll only while the event can still change, and slow down far-future events
  // so users who keep an event tab open do not trigger a full RSC refresh every
  // minute for hours.
  const shouldPoll = !event.battle_started_at || !isEnded(event.battle_started_at)
  const battleEnded = !!event.battle_started_at && isEnded(event.battle_started_at)
  const pollIntervalMs = resolveEventPollIntervalMs(event)
  let myAssigned:
    | { partyName: string; slotNumber: number; roleName: string | null }
    | null = null
  let myPending:
    | { partyName: string; slotNumber: number; roleName: string | null }
    | null = null
  if (interactionSession) {
    for (const party of parties) {
      const customName = party.name?.trim()
      const partyName = party.is_bomb_squad && customName
        ? customName
        : t('partyNumber', { number: party.party_number })
      for (const slot of party.slots) {
        if (!myAssigned && slot.assigned_discord_id === interactionSession.discordId) {
          myAssigned = { partyName, slotNumber: slot.slot_number, roleName: slot.role_name }
        }
        if (!myPending && slot.requested_discord_id === interactionSession.discordId) {
          myPending = { partyName, slotNumber: slot.slot_number, roleName: slot.role_name }
        }
      }
    }
  }
  const myEventRegearParticipantResult =
    interactionSession?.isMember && event.category !== '전투'
      ? await db
          .from('event_regear_participants')
          .select('discord_id')
          .eq('guild_id', guildId)
          .eq('event_id', id)
          .eq('discord_id', interactionSession.discordId)
          .maybeSingle()
      : { data: null }
  const hasMyEventRegearParticipant = !!myEventRegearParticipantResult.data
  const myTentative = interactionSession
    ? tentativeRows.find((row) => row.discord_id === interactionSession.discordId) ?? null
    : null
  const myTentativeRoleNames =
    myTentative?.possible_roles.map((role) => translateSlotRole(role, tRole)).filter(Boolean) ?? []
  const myStatusTone: EventMyStatusTone = !interactionSession
    ? 'guest'
    : myAssigned
      ? 'success'
      : myPending || myTentative
        ? 'pending'
        : 'neutral'
  const myStatusDetails = myAssigned
    ? [
        t('myStatusPartySlot', {
          party: myAssigned.partyName,
          slot: myAssigned.slotNumber,
        }),
        myAssigned.roleName
          ? t('myStatusRole', { role: translateSlotRole(myAssigned.roleName, tRole) })
          : null,
      ].filter((v): v is string => !!v)
    : myPending
      ? [
          t('myStatusPartySlot', {
            party: myPending.partyName,
            slot: myPending.slotNumber,
          }),
          myPending.roleName
            ? t('myStatusRole', { role: translateSlotRole(myPending.roleName, tRole) })
            : null,
        ].filter((v): v is string => !!v)
      : myTentative
        ? myTentativeRoleNames.length > 0
          ? [t('myStatusTentativeRoles', { roles: myTentativeRoleNames.join(', ') })]
          : []
        : interactionSession?.isGuest && guestProfile
          ? [t('myStatusGuestName', { name: guestProfile.displayName })]
          : []
  const myStatusTitle = !interactionSession
    ? t('myStatusGuestTitle')
    : myAssigned
      ? t('myStatusAssignedTitle')
      : myPending
        ? t('myStatusPendingTitle')
        : myTentative
          ? t('myStatusTentativeTitle')
          : isBombSquadCallerOnly
            ? t('myStatusCallerTitle')
          : t('myStatusNoneTitle')
  const myStatusDescription = !interactionSession
    ? t('myStatusGuestBody')
    : myAssigned
      ? event.battle_started_at
        ? t('myStatusAssignedStartedBody')
        : t('myStatusAssignedBody')
      : myPending
        ? t('myStatusPendingBody')
        : myTentative
          ? t('myStatusTentativeBody')
          : isBombSquadCallerOnly
            ? t('myStatusCallerBody')
          : t('myStatusNoneBody')
  const canRequestRegear = canRequestRegearFromEventStatus({
    isMember: interactionSession?.isMember === true,
    battleStarted: !!event.battle_started_at,
    category: event.category,
    hasCurrentSlot: !!myAssigned,
    hasEventRegearParticipant: hasMyEventRegearParticipant,
    regearPolicy: event.regear_policy,
  })
  const myStatusPrimaryAction = !interactionSession
    ? { href: loginHref, label: t('myStatusLogin') }
    : canRequestRegear
      ? { href: '/regear', label: t('myStatusRegear') }
      : undefined
  const myStatusSecondaryAction = interactionSession && !canRequestRegear && !myAssigned
    ? isBombSquadCallerOnly
      ? undefined
      : { href: '#event-slots', label: t('myStatusFindSlot') }
    : !interactionSession && localLoginHref
      ? { href: localLoginHref, label: t('myStatusLocalLogin') }
    : undefined

  return (
    <div className="flex-1 w-full max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 py-6 sm:py-8 flex flex-col lg:flex-row lg:gap-6 space-y-4 lg:space-y-0">
      {shouldShowGuestProfileGate && (
        <EventGuestProfileGate
          eventId={id}
          inviteToken={hasGuestInvite ? inviteToken : null}
          initialProfile={guestProfile}
        />
      )}
      {shouldPoll && <AutoRefresh intervalMs={pollIntervalMs} />}
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
            <div className="flex items-center gap-2 flex-wrap">
              {battleEnded && (
                <Link
                  href={`/events/${id}/report`}
                  className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20 text-amber-300 text-sm font-bold px-2.5 py-1 rounded-full transition-colors"
                >
                  <FileText size={12} />
                  {t('viewReport')}
                </Link>
              )}
              {event.battle_started_at && (
                <span className="inline-flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-sm font-bold px-2.5 py-1 rounded-full">
                  <Swords size={12} />
                  {t('inProgress', { time: formatStartedAt(event.battle_started_at, tz) })}
                </span>
              )}
              {canEdit && (
                <EventGuestInviteManager
                  eventId={id}
                  initialTokens={[...(guestTokens ?? [])]}
                  origin={origin}
                  tenantTimezone={tz}
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
                {t.rich(event.category === '전투' ? 'startedNotice' : 'startedNoticeFlexible', {
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
            {event.gather_location.trim() && (
              <div className="flex items-center gap-1.5 text-gray-300">
                <MapPin size={14} className="text-amber-400" />
                {event.gather_location}
              </div>
            )}
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
          <EventMyStatusCard
            title={t('myStatusTitle')}
            statusTitle={myStatusTitle}
            description={myStatusDescription}
            tone={myStatusTone}
            details={myStatusDetails}
            primaryAction={myStatusPrimaryAction}
            secondaryAction={myStatusSecondaryAction}
          />
        </div>

        <div className="lg:hidden">
          <EventSlotSidebar placement="mobile" parties={parties} avatars={avatars} />
        </div>

        {(event.recruitment_mode === 'build_sheet' || event.recruitment_mode === 'hybrid') && (
          <>
            <BuildSheetApplicationPanel
              eventId={id}
              entries={buildSheetState?.entries ?? []}
              demands={buildSheetState?.demands ?? []}
              myApplication={myBuildSheetApplication}
              canApply={canApplyToSlots}
              loginHref={loginHref}
              battleStarted={!!event.battle_started_at}
            />
            {canManageBuildSheet && (
              <BuildSheetAssignmentBoard
                eventId={id}
                demands={buildSheetState?.demands ?? []}
                applications={buildSheetState?.applications ?? []}
                canManageAll={canEdit}
                manageablePartyNumbers={buildSheetManageableParties}
              />
            )}
            {totalSlots > 0 && (
              <EventBuildSheetSummary parties={parties} mode={event.recruitment_mode} />
            )}
          </>
        )}

        <TentativeSignupSection
          eventId={id}
          rows={tentativeRows}
          avatars={avatars}
          currentDiscordId={interactionSession?.discordId ?? null}
          isGuest={interactionSession?.isGuest ?? false}
          canSelfSignup={!isBombSquadCallerOnly}
          isAdmin={interactionSession?.isAdmin ?? false}
          isEventOwner={canManageTentativeSignups}
          loginHref={loginHref}
          battleStarted={!!event.battle_started_at}
        />

        <div id="event-slots" data-tour-id="member-tour-event-detail" className="scroll-mt-20">
          <EventPartyGrid
            parties={parties}
            currentDiscordId={interactionSession?.discordId ?? null}
            loginHref={loginHref}
            battleStarted={!!event.battle_started_at}
            isAdmin={interactionSession?.isAdmin ?? false}
            canManageSlots={canEdit}
            eventId={id}
            avatars={avatars}
            usernames={usernames}
            roleExperienceCounts={roleExperienceCounts}
            cdBadgeRoles={cdBadgeRoles}
            autoRegearEnabled={autoRegearEnabled}
            eventCategory={event.category}
            timezone={tz}
            suggestedRoles={myTentative?.possible_roles ?? []}
            canApplyToSlots={canApplyToSlots && !buildSheetMode}
          />
        </div>
      </main>

      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0">
        <EventSlotSidebar placement="desktop" parties={parties} avatars={avatars} />
      </aside>
    </div>
  )
}
