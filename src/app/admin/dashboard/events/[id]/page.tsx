import { getAdminClient } from '@/lib/supabase-admin'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Event, EventCategory, PartyWithSlots } from '@/types'
import { CATEGORY_PARTY_LIMITS } from '@/types'
import EventInfoForm from '@/components/EventInfoForm'
import PublishEventBanner from '@/components/PublishEventBanner'
import PartyListEditor from '@/components/PartyListEditor'
import EventSlotSidebar from '@/components/EventSlotSidebar'
import SaveAsTemplateButton from '@/components/SaveAsTemplateButton'
import LoadTemplateButton from '@/components/LoadTemplateButton'
import DeleteEventButton from '@/components/DeleteEventButton'
import EventPayoutRequestButton from '@/components/EventPayoutRequestButton'
import EventBuildSheetSummary from '@/components/EventBuildSheetSummary'
import BuildSheetPlanner from '@/components/BuildSheetPlanner'
import BuildSheetAssignmentBoard from '@/components/BuildSheetAssignmentBoard'
import { EventEditSaveProvider } from '@/components/EventEditSaveRegistry'
import EventEditSaveBar from '@/components/EventEditSaveBar'
import { listTemplates } from '@/app/actions/templates'
import TentativeSignupSection from '@/components/TentativeSignupSection'
import { listTentativeSignupsForGuild } from '@/lib/event-tentative-signups'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'
import { getAppSetting } from '@/lib/app-settings'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { isEnded } from '@/lib/gather-time'
import { getTenantTimezone } from '@/lib/timezone-server'
import { loadBuildSheetEventState } from '@/lib/build-sheet-data'

async function getData(id: string, guildId: string) {
  // guild_avatars 는 anon/authenticated 에 revoke 되어 있어 (migration 008)
  // service-role client 로만 읽을 수 있다. 이 server component 는 admin 전용
  // 레이아웃 하위라 service-role 사용이 안전.
  const admin = getAdminClient()
  const [{ data: event }, { data: parties }, { data: directory }] = await Promise.all([
    admin.from('events').select('*').eq('guild_id', guildId).eq('id', id).single(),
    admin
      .from('parties')
      .select('*, slots(*)')
      .eq('guild_id', guildId)
      .eq('event_id', id)
      .order('party_number'),
    // Bomb squad caller picker — admin picks from members whose Discord
    // role(s) are listed under the `bomb_squad_caller_role_ids` app setting.
    // The flag is refreshed at login and member-sync. Caller role holders can
    // be listed here even when they do not have the active member role.
    admin
      .from('guild_avatars')
      .select('discord_id, username')
      .eq('guild_id', guildId)
      .eq('is_bomb_squad_caller', true)
      .order('username'),
  ])

  const sorted = (parties ?? []).map((p) => ({
    ...p,
    slots: [...(p.slots ?? [])].sort((a, b) => a.slot_number - b.slot_number),
  })) as PartyWithSlots[]

  // Include assigned-but-no-longer-eligible callers so the dropdown can still
  // display their name. Marked `eligible:false` so the UI can flag them as
  // role-revoked — admin can then replace or clear the assignment.
  const eligibleIds = new Set((directory ?? []).map((m) => m.discord_id))
  const staleCallerIds = sorted
    .map((p) => p.caller_discord_id)
    .filter((id): id is string => !!id && !eligibleIds.has(id))

  const { data: staleCallers } = staleCallerIds.length > 0
    ? await admin
        .from('guild_avatars')
        .select('discord_id, username')
        .eq('guild_id', guildId)
        .in('discord_id', staleCallerIds)
    : { data: [] as { discord_id: string; username: string }[] }

  const memberDirectory = [
    ...(directory ?? []).map((m) => ({ ...m, eligible: true as const })),
    ...(staleCallers ?? []).map((m) => ({ ...m, eligible: false as const })),
  ]

  return {
    event: event as Event | null,
    parties: sorted,
    memberDirectory,
  }
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [
    { event, parties, memberDirectory },
    { templates },
    t,
    autoRegearRaw,
    tenantTimezone,
    tentativeRes,
    tenantConfig,
  ] = await Promise.all([
    getData(id, guildId),
    listTemplates(),
    getTranslations('adminEditEvent'),
    getAppSetting('auto_regear_enabled', 'false', guildId),
    getTenantTimezone(guildId),
    listTentativeSignupsForGuild(id, guildId),
    getTenantDiscordConfig(guildId),
  ])
  const autoRegearEnabled = autoRegearRaw === 'true'

  if (!event) notFound()
  const canEditEvent =
    session.isAdmin ||
    sessionHas(session, CAP.EVENT_MANAGE) ||
    (sessionCanCreateOrManageEvents(session) &&
      !!event.created_by &&
      event.created_by === session.discordId)
  if (!canEditEvent) notFound()
  const buildSheetState =
    event.recruitment_mode === 'build_sheet' || event.recruitment_mode === 'hybrid'
      ? await loadBuildSheetEventState(id, guildId, { includeApplications: true })
      : null

  const eventCategory: EventCategory = event.category
  const partyLimits = CATEGORY_PARTY_LIMITS[eventCategory]
  const hasParties = parties.length > 0
  const hasSlots = parties.some((p) => p.slots.length > 0)
  const publishSummary = {
    visibleSlots: parties.reduce((sum, p) => sum + p.slots.filter((s) => !s.is_hidden).length, 0),
    hiddenSlots: parties.reduce((sum, p) => sum + p.slots.filter((s) => s.is_hidden).length, 0),
    assignedSlots: parties.reduce(
      (sum, p) => sum + p.slots.filter((s) => !!s.assigned_discord_id).length,
      0,
    ),
    emptySlots: parties.reduce(
      (sum, p) => sum + p.slots.filter((s) => !s.is_hidden && !s.assigned_discord_id).length,
      0,
    ),
    tentativeCount: tentativeRes.rows.length,
    hasNotificationChannel: !!(event.notify_channel_id ?? tenantConfig?.eventChannelId),
  }

  const assignedDiscordIds = parties.flatMap((p) =>
    p.slots.map((s) => s.assigned_discord_id).filter((id): id is string => !!id),
  )
  const tentativeRows = tentativeRes.rows
  // 어드민이 다른 멤버를 대신 참가예정에 등록할 수 있도록 활성 멤버 디렉터리를
  // 한 번 더 조회. 탈퇴자(withdrawn_at not null) 는 제외. 아바타 조회와는
  // 서로 독립적이라 같은 Promise.all 묶음으로 round-trip 을 1회로 줄인다.
  const adminClient = getAdminClient()
  const [tentativeDirectoryRes, avatarMap] = await Promise.all([
    adminClient
      .from('guild_avatars')
      .select('discord_id, username, albion_nickname, avatar')
      .eq('guild_id', guildId)
      .is('withdrawn_at', null)
      .order('username'),
    getAvatarsByDiscordIds(guildId, [
      ...assignedDiscordIds,
      ...tentativeRows.map((r) => r.discord_id),
    ]),
  ])
  const tentativeDirectory = (tentativeDirectoryRes.data ?? []).map((m) => ({
    discord_id: m.discord_id,
    username: m.username,
    albion_nickname: m.albion_nickname ?? null,
    avatar: m.avatar ?? null,
  }))
  const avatars = Object.fromEntries(avatarMap)
  const canManageTentativeSignups = canEditEvent

  return (
    <EventEditSaveProvider>
      <div className="flex flex-col lg:flex-row lg:gap-6 space-y-4 lg:space-y-0">
        <div className="flex-1 min-w-0 space-y-6 sm:space-y-8">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {isEnded(event.battle_started_at) && hasSlots && (
                <EventPayoutRequestButton eventId={event.id} />
              )}
              <DeleteEventButton eventId={event.id} redirectTo="/admin/dashboard" variant="labeled" />
            </div>
          </div>
          {event.status === 'draft' && <PublishEventBanner event={event} summary={publishSummary} />}
          <EventInfoForm initialEvent={event} tenantTimezone={tenantTimezone} />

          <TentativeSignupSection
            eventId={id}
            rows={tentativeRows}
            avatars={avatars}
            currentDiscordId={session.discordId}
            isAdmin={session.isAdmin}
            isEventOwner={canManageTentativeSignups}
            loginHref="/api/auth/discord/start"
            battleStarted={!!event.battle_started_at}
            memberDirectory={tentativeDirectory}
          />

          <div className="lg:hidden">
            <EventSlotSidebar placement="mobile" parties={parties} avatars={avatars} />
          </div>

          <hr className="border-gray-700" />
          <section className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{t('partyConfigTitle')}</h2>
                <p className="text-gray-400 text-xs sm:text-sm mt-1">
                  {t('partyConfigDescription', { max: partyLimits.max })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <LoadTemplateButton
                  eventId={id}
                  templates={templates}
                  timezone={tenantTimezone}
                  hasExistingParties={hasParties}
                />
                {hasSlots && (
                  <SaveAsTemplateButton
                    eventId={id}
                    defaultName={event.title}
                    templates={templates}
                    timezone={tenantTimezone}
                  />
                )}
              </div>
            </div>
            {(event.recruitment_mode === 'build_sheet' || event.recruitment_mode === 'hybrid') && (
              <>
                <BuildSheetPlanner
                  eventId={id}
                  demands={buildSheetState?.demands ?? []}
                  assigners={buildSheetState?.assigners ?? []}
                  memberDirectory={memberDirectory}
                  defaultPartyCount={partyLimits.default}
                  maxPartyCount={partyLimits.max}
                />
                <BuildSheetAssignmentBoard
                  eventId={id}
                  demands={buildSheetState?.demands ?? []}
                  applications={buildSheetState?.applications ?? []}
                  canManageAll
                  manageablePartyNumbers={[]}
                />
                {hasSlots && (
                  <EventBuildSheetSummary parties={parties} mode={event.recruitment_mode} />
                )}
              </>
            )}
            <PartyListEditor
              eventId={id}
              parties={parties}
              memberDirectory={memberDirectory}
              autoRegearEnabled={autoRegearEnabled}
              eventCategory={eventCategory}
              timezone={tenantTimezone}
            />
          </section>

          <EventEditSaveBar
            eventId={event.id}
            eventStatus={event.status}
            showPublishAction={event.status === 'draft'}
          />
        </div>

        <aside className="hidden lg:block w-72 flex-shrink-0">
          <EventSlotSidebar placement="desktop" parties={parties} avatars={avatars} />
        </aside>
      </div>
    </EventEditSaveProvider>
  )
}
