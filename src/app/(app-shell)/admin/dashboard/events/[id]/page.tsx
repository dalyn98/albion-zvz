import { getAdminClient } from '@/lib/supabase-admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
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
import CancelEventOperationsButton from '@/components/CancelEventOperationsButton'
import EventBuildSheetSummary from '@/components/EventBuildSheetSummary'
import BuildSheetPlanner from '@/components/BuildSheetPlanner'
import BuildSheetAssignmentBoard from '@/components/BuildSheetAssignmentBoard'
import { EventEditSaveProvider } from '@/components/EventEditSaveRegistry'
import EventEditSaveBar from '@/components/EventEditSaveBar'
import EventRosterDraftProvider from '@/components/EventRosterDraftProvider'
import EventRegearRoleOverridesPanel from '@/components/EventRegearRoleOverridesPanel'
import type {
  EventRegearRoleOverrideRow,
  EventRegearRoleRewardRow,
} from '@/components/EventRegearRoleOverridesPanel'
import { listTemplates } from '@/app/actions/templates'
import TentativeSignupSection from '@/components/TentativeSignupSection'
import {
  buildTentativeSlotRecommendationOptions,
  listTentativeSignupsForGuild,
} from '@/lib/event-tentative-signups'
import { listEventRegearParticipantsForGuild } from '@/lib/event-regear-participants'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'
import { getAppSetting } from '@/lib/app-settings'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { canUseEventRegearPolicy } from '@/lib/regear-event-policy'
import { isEnded } from '@/lib/gather-time'
import { getTenantTimezone } from '@/lib/timezone-server'
import { loadBuildSheetEventState } from '@/lib/build-sheet-data'
import EventRegearParticipantsPanel from '@/components/EventRegearParticipantsPanel'
import EventEditWorkflowNav from '@/components/EventEditWorkflowNav'
import { EVENT_ROW_SELECT, PARTY_WITH_SLOTS_SELECT } from '@/lib/event-query-selects'
import { summarizeEventPublishState } from '@/lib/event-publish-summary'
import { listPublishedTacticBoards } from '@/lib/tactics/queries'
import { getEventTacticSnapshotSummary } from '@/lib/event-operations-server'
import { formatDateTimeShort } from '@/lib/format-datetime'
import EventTacticAssignmentCard from '@/components/EventTacticAssignmentCard'
import { ClipboardCheck } from 'lucide-react'
import EventEffectiveRegearPolicyPanel from '@/components/EventEffectiveRegearPolicyPanel'
import { listEventEffectiveRegearPolicies } from '@/lib/regear-effective-policy-server'
import { getRegearSupportConfiguration } from '@/lib/regear-support-server'
import { isTacticsExperimentalEnabled } from '@/lib/tactics/feature-server'

async function getData(id: string, guildId: string) {
  // guild_avatars 는 anon/authenticated 에 revoke 되어 있어 (migration 008)
  // service-role client 로만 읽을 수 있다. 이 server component 는 admin 전용
  // 레이아웃 하위라 service-role 사용이 안전.
  const admin = getAdminClient()
  const [
    { data: event },
    { data: parties },
    { data: directory },
    regearParticipants,
    { data: roleRewards },
    { data: roleOverrides },
    effectiveRegearPolicies,
  ] = await Promise.all([
    admin.from('events').select(EVENT_ROW_SELECT).eq('guild_id', guildId).eq('id', id).single(),
    admin
      .from('parties')
      .select(PARTY_WITH_SLOTS_SELECT)
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
    listEventRegearParticipantsForGuild(id, guildId),
    admin
      .from('role_rewards')
      .select('role_name, silver, payout_rate_percent')
      .eq('guild_id', guildId)
      .order('role_name'),
    admin
      .from('event_regear_role_overrides')
      .select('role_name, enabled, silver_cap, payout_rate_percent')
      .eq('guild_id', guildId)
      .eq('event_id', id)
      .order('role_name'),
    listEventEffectiveRegearPolicies({
      db: admin,
      guildId,
      eventId: id,
    }),
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
    regearParticipants: regearParticipants.rows,
    roleRewards: (roleRewards ?? []).map((row) => ({
      roleName: row.role_name as string,
      silver: row.silver as number,
      payoutRatePercent:
        typeof row.payout_rate_percent === 'number' ? row.payout_rate_percent : null,
    })) satisfies EventRegearRoleRewardRow[],
    roleOverrides: (roleOverrides ?? []).map((row) => ({
      roleName: row.role_name as string,
      enabled: row.enabled === true,
      silverCap: typeof row.silver_cap === 'number' ? row.silver_cap : null,
      payoutRatePercent:
        typeof row.payout_rate_percent === 'number' ? row.payout_rate_percent : null,
    })) satisfies EventRegearRoleOverrideRow[],
    effectiveRegearPolicies,
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
  const tacticsExperimentalEnabled = await isTacticsExperimentalEnabled(guildId)
  const [
    {
      event,
      parties,
      memberDirectory,
      regearParticipants,
      roleRewards,
      roleOverrides,
      effectiveRegearPolicies,
    },
    { templates },
    t,
    autoRegearRaw,
    tenantTimezone,
    tentativeRes,
    tenantConfig,
    publishedTactics,
    tacticSnapshot,
    regearSupport,
    tRegear,
  ] = await Promise.all([
    getData(id, guildId),
    listTemplates(),
    getTranslations('adminEditEvent'),
    getAppSetting('auto_regear_enabled', 'false', guildId),
    getTenantTimezone(guildId),
    listTentativeSignupsForGuild(id, guildId),
    getTenantDiscordConfig(guildId),
    tacticsExperimentalEnabled
      ? listPublishedTacticBoards(guildId)
      : Promise.resolve([]),
    tacticsExperimentalEnabled
      ? getEventTacticSnapshotSummary(guildId, id)
      : Promise.resolve(null),
    getRegearSupportConfiguration(guildId),
    getTranslations('regear'),
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
  const canManageRegearPolicy =
    regearSupport.supported &&
    (session.isAdmin || sessionHas(session, CAP.REGEAR_EDIT_PRICE))
  const buildSheetState =
    event.recruitment_mode === 'build_sheet' || event.recruitment_mode === 'hybrid'
      ? await loadBuildSheetEventState(id, guildId, { includeApplications: true })
      : null

  const eventCategory: EventCategory = event.category
  const partyLimits = CATEGORY_PARTY_LIMITS[eventCategory]
  const hasParties = parties.length > 0
  const hasSlots = parties.some((p) => p.slots.length > 0)
  const publishSummary = summarizeEventPublishState({
    slots: parties.flatMap((party) => party.slots.map((slot) => ({
      isHidden: slot.is_hidden,
      assignedDiscordId: slot.assigned_discord_id,
    }))),
    tentativeCount: tentativeRes.rows.length,
    eventNotificationChannelId: event.notify_channel_id,
    tenantNotificationChannelId: tenantConfig?.eventChannelId ?? null,
  })

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
      ...regearParticipants.map((r) => r.discord_id),
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
  const canFinalizeParticipation =
    session.isAdmin || sessionHas(session, CAP.EVENT_MANAGE)
  const hasRegearSection = regearSupport.supported
    ? (
        (canUseEventRegearPolicy(event.category) &&
          roleRewards.length > 0 &&
          canManageRegearPolicy) ||
        event.category !== '전투'
      )
    : (
        roleOverrides.length > 0 ||
        effectiveRegearPolicies.rows.length > 0 ||
        regearParticipants.length > 0
      )

  return (
    <EventEditSaveProvider>
      <EventRosterDraftProvider eventId={event.id} initialParties={parties}>
        <div className="flex flex-col xl:flex-row xl:gap-6 space-y-4 xl:space-y-0">
        <div className="flex-1 min-w-0 space-y-6 sm:space-y-8">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {event.status === 'published' &&
                canFinalizeParticipation &&
                isEnded(event.battle_started_at, event.operational_ended_at) && (
                <Link
                  href={`/events/${event.id}/report`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-500/20"
                >
                  <ClipboardCheck size={13} />
                  {t('participationCloseoutButton')}
                </Link>
              )}
              {event.status === 'published' &&
                event.battle_started_at &&
                !isEnded(event.battle_started_at, event.operational_ended_at) && (
                  <CancelEventOperationsButton eventId={event.id} />
                )}
              {!event.battle_started_at && (
                <DeleteEventButton eventId={event.id} redirectTo="/admin/dashboard/events" variant="labeled" />
              )}
            </div>
          </div>
          {!regearSupport.supported && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-amber-200">
                {tRegear('supportDisabledTitle')}
              </p>
              <p className="mt-1 text-xs text-amber-100/80">
                {tRegear('supportDisabledDescription')}
              </p>
            </div>
          )}
          {event.status === 'draft' && <PublishEventBanner event={event} summary={publishSummary} />}
          <EventEditWorkflowNav hasRegearSection={hasRegearSection} />
          {tacticsExperimentalEnabled && event.category === '전투' && (
            <EventTacticAssignmentCard
              eventId={event.id}
              boards={publishedTactics}
              snapshot={tacticSnapshot ? {
                sourceBoardId: tacticSnapshot.sourceBoardId,
                sourceBoardUpdatedAt: tacticSnapshot.sourceBoardUpdatedAt,
                title: tacticSnapshot.title,
                capturedAtLabel: formatDateTimeShort(tacticSnapshot.capturedAt, tenantTimezone),
              } : null}
              battleStarted={!!event.battle_started_at}
            />
          )}
          <div id="event-edit-details" className="scroll-mt-24">
            <EventInfoForm
              initialEvent={event}
              tenantTimezone={tenantTimezone}
              canManageRegearPolicy={canManageRegearPolicy}
              regearPolicyLocked={Boolean(event.regear_policy_version_id)}
            />
          </div>

          {hasRegearSection && (
            <div id="event-edit-regear" className="scroll-mt-24 space-y-6">
              {canUseEventRegearPolicy(event.category) &&
                (regearSupport.supported || roleOverrides.length > 0) && (
                <EventRegearRoleOverridesPanel
                  eventId={id}
                  roleRewards={roleRewards}
                  overrides={roleOverrides}
                  canManage={regearSupport.supported && canManageRegearPolicy}
                  locked={Boolean(event.regear_policy_version_id)}
                />
              )}

              <EventEffectiveRegearPolicyPanel
                rows={effectiveRegearPolicies.rows}
                locked={effectiveRegearPolicies.locked}
                variant="admin"
              />

              {event.category !== '전투' && (
                <EventRegearParticipantsPanel
                  eventId={id}
                  rows={regearParticipants}
                  avatars={avatars}
                  memberDirectory={tentativeDirectory}
                  canManage={regearSupport.supported && canEditEvent}
                />
              )}
            </div>
          )}

          <div id="event-edit-attendance" className="scroll-mt-24">
            <TentativeSignupSection
              eventId={id}
              rows={tentativeRows}
              slotOptions={buildTentativeSlotRecommendationOptions(parties)}
              avatars={avatars}
              currentDiscordId={session.discordId}
              isAdmin={session.isAdmin}
              isEventOwner={canManageTentativeSignups}
              loginHref={`/login?returnTo=${encodeURIComponent(`/events/${id}`)}`}
              recruitmentClosed={Boolean(
                event.status !== 'published',
              )}
              recommendationClosed={Boolean(
                event.status !== 'published' ||
                event.battle_started_at ||
                event.tentative_snapshot_version_id,
              )}
              memberDirectory={tentativeDirectory}
            />
          </div>

          <div className="min-[1800px]:hidden">
            <EventSlotSidebar placement="mobile" parties={parties} avatars={avatars} />
          </div>

          <hr className="border-gray-700" />
          <section id="event-edit-roster" className="scroll-mt-24 space-y-3 sm:space-y-4">
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
            publishSummary={publishSummary}
          />
        </div>

        <aside className="hidden min-[1800px]:block w-72 flex-shrink-0">
          <EventSlotSidebar placement="desktop" parties={parties} avatars={avatars} />
        </aside>
        </div>
      </EventRosterDraftProvider>
    </EventEditSaveProvider>
  )
}
