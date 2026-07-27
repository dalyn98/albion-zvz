'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireEventCreatorForEvent } from '@/lib/auth'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { CAP } from '@/lib/permissions'
import { canUseAllianceEventFeaturesForSession } from '@/lib/albion-identity'
import {
  MAX_BUILD_SHEET_PREFERENCES,
  isBuildSheetRole,
  normalizeBuildSheetPreferenceIds,
  parseBuildSheetPreferences,
  type BuildSheetPartyAssigner,
  type BuildSheetPreferenceSnapshot,
  type BuildSheetRole,
  type BuildSheetRoleDemand,
} from '@/lib/build-sheet'
import { getBuildEntryWeapon } from '@/lib/build-sheet'
import { applyTemplateToSlotInput } from '@/lib/slot-template-shape'
import { emptySlotInput } from '@/components/SlotEditor/slot-input'
import { slotToRow } from './admin-slot-sanitizers'
import { MAX_COMBAT_EVENT_PARTIES, type EventRecruitmentMode } from '@/types'
import type { SlotTemplateData } from './slot-templates'

interface EventAuthRow {
  id: string
  guild_id: string
  created_by: string | null
  recruitment_mode: EventRecruitmentMode
  status: 'draft' | 'published'
  battle_started_at: string | null
}

interface TemplateRow {
  id: string
  name: string
  data: Record<string, unknown>
  role_type: string | null
}

type BuildSheetActionResult = Promise<{ error?: string }>

const MAX_PARTY_NUMBER = MAX_COMBAT_EVENT_PARTIES
const MAX_REQUIRED_PER_ROLE = 20

function isBuildSheetMode(mode: EventRecruitmentMode | string | null | undefined): boolean {
  return mode === 'build_sheet' || mode === 'hybrid'
}

function revalidateBuildSheetSurfaces(eventId: string): void {
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath('/')
  revalidatePath('/me')
}

function isGuestOutsideEventScope(
  session: { isGuest?: boolean; eventScope?: string | null },
  eventId: string,
): boolean {
  return Boolean(session.isGuest) && session.eventScope !== eventId
}

async function loadEventForGuild(eventId: string, guildId: string): Promise<EventAuthRow | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('events')
    .select('id, guild_id, created_by, recruitment_mode, status, battle_started_at')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as EventAuthRow | null
}

async function canManageBuildSheetParty(
  event: EventAuthRow,
  guildId: string,
  partyNumber: number,
): Promise<boolean> {
  const session = await getSession()
  if (!session) return false
  if (session.isAdmin || sessionHas(session, CAP.EVENT_MANAGE)) return true
  if (
    sessionCanCreateOrManageEvents(session) &&
    event.created_by &&
    event.created_by === session.discordId
  ) {
    return true
  }
  const db = getAdminClient()
  const { data, error } = await db
    .from('event_build_party_assigners')
    .select('id')
    .eq('guild_id', guildId)
    .eq('event_id', event.id)
    .eq('party_number', partyNumber)
    .eq('caller_discord_id', session.discordId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return !!data
}

export async function saveBuildSheetPlan(
  eventId: string,
  demands: BuildSheetRoleDemand[],
  assigners: BuildSheetPartyAssigner[],
): BuildSheetActionResult {
  const tErr = await getTranslations('adminActionError')
  const t = await getTranslations('buildSheetRecruitment')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(eventId)
    const guildId = await getSessionGuildId(session)
    const event = await loadEventForGuild(eventId, guildId)
    if (!event) return { error: tErr('eventNotFound') }
    if (!isBuildSheetMode(event.recruitment_mode)) {
      return { error: t('errors.modeRequired') }
    }

    const cleanDemands = demands
      .filter((d) => isBuildSheetRole(d.role_type))
      .map((d) => ({
        party_number: Number(d.party_number),
        role_type: d.role_type,
        required_count: Number(d.required_count),
      }))
      .filter((d) =>
        Number.isInteger(d.party_number) &&
        d.party_number >= 1 &&
        d.party_number <= MAX_PARTY_NUMBER &&
        Number.isInteger(d.required_count) &&
        d.required_count >= 0 &&
        d.required_count <= MAX_REQUIRED_PER_ROLE,
      )

    const cleanAssigners = assigners
      .map((a) => ({
        party_number: Number(a.party_number),
        caller_discord_id: a.caller_discord_id.trim(),
      }))
      .filter((a) =>
        Number.isInteger(a.party_number) &&
        a.party_number >= 1 &&
        a.party_number <= MAX_PARTY_NUMBER &&
        a.caller_discord_id,
      )

    const callerIds = Array.from(new Set(cleanAssigners.map((a) => a.caller_discord_id)))
    if (callerIds.length > 0) {
      const { data: eligibleRows, error: eligibleError } = await db
        .from('guild_avatars')
        .select('discord_id')
        .eq('guild_id', guildId)
        .eq('is_bomb_squad_caller', true)
        .in('discord_id', callerIds)
      if (eligibleError) return { error: await publicActionError(eligibleError, 'actions/build-sheet') }
      const eligible = new Set((eligibleRows ?? []).map((row) => row.discord_id as string))
      const invalid = callerIds.find((id) => !eligible.has(id))
      if (invalid) return { error: t('errors.assignerNotEligible') }
    }

    const { error: demandDeleteError } = await db
      .from('event_build_role_demands')
      .delete()
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
    if (demandDeleteError) return { error: await publicActionError(demandDeleteError, 'actions/build-sheet') }

    const demandRows = cleanDemands
      .filter((d) => d.required_count > 0)
      .map((d) => ({ ...d, guild_id: guildId, event_id: eventId }))
    if (demandRows.length > 0) {
      const { error } = await db.from('event_build_role_demands').insert(demandRows)
      if (error) return { error: await publicActionError(error, 'actions/build-sheet') }
    }

    const { error: assignerDeleteError } = await db
      .from('event_build_party_assigners')
      .delete()
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
    if (assignerDeleteError) return { error: await publicActionError(assignerDeleteError, 'actions/build-sheet') }

    if (cleanAssigners.length > 0) {
      const rows = cleanAssigners.map((a) => ({ ...a, guild_id: guildId, event_id: eventId }))
      const { error } = await db.from('event_build_party_assigners').insert(rows)
      if (error) return { error: await publicActionError(error, 'actions/build-sheet') }
    }

    revalidateBuildSheetSurfaces(eventId)
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/build-sheet') }
  }
}

export async function submitBuildSheetApplication(
  eventId: string,
  roleType: BuildSheetRole,
  templateIds: string[],
): BuildSheetActionResult {
  const tErr = await getTranslations('adminActionError')
  const t = await getTranslations('buildSheetRecruitment')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    if (!isBuildSheetRole(roleType)) return { error: t('errors.invalidRole') }
    if (isGuestOutsideEventScope(session, eventId)) {
      return { error: t('errors.guestWrongEvent') }
    }
    const guildId = await getSessionGuildId(session)
    const event = await loadEventForGuild(eventId, guildId)
    if (!event || event.status === 'draft') return { error: tErr('eventNotFound') }
    if (!isBuildSheetMode(event.recruitment_mode)) {
      return { error: t('errors.modeRequired') }
    }
    if (event.battle_started_at) return { error: t('errors.battleStarted') }

    const allianceAllowed = await canUseAllianceEventFeaturesForSession(session.discordId, guildId)
    const canApply = session.isMember || session.isGuest || allianceAllowed
    if (!canApply) return { error: tErr('unauthorized') }

    const preferenceIds = normalizeBuildSheetPreferenceIds(templateIds)
    if (preferenceIds.length === 0) return { error: t('errors.preferenceRequired') }

    const db = getAdminClient()
    const { data: existing, error: existingError } = await db
      .from('event_build_applications')
      .select('id, status')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('applicant_discord_id', session.discordId)
      .maybeSingle()
    if (existingError) return { error: await publicActionError(existingError, 'actions/build-sheet') }
    if (existing?.status === 'assigned') return { error: t('errors.alreadyAssigned') }

    const { data: roleDemandRows, error: roleDemandError } = await db
      .from('event_build_role_demands')
      .select('required_count')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('role_type', roleType)
    if (roleDemandError) return { error: await publicActionError(roleDemandError, 'actions/build-sheet') }
    const roleDemand = (roleDemandRows ?? []).reduce(
      (sum, row) => sum + Number(row.required_count ?? 0),
      0,
    )
    if (roleDemand <= 0) return { error: t('errors.roleClosed') }

    const { data: templates, error: templateError } = await db
      .from('slot_templates')
      .select('id, name, data, role_type:data->>role_name')
      .eq('guild_id', guildId)
      .in('id', preferenceIds)
    if (templateError) return { error: await publicActionError(templateError, 'actions/build-sheet') }

    const byId = new Map(((templates ?? []) as TemplateRow[]).map((row) => [row.id, row]))
    const preferences: BuildSheetPreferenceSnapshot[] = []
    for (const [index, id] of preferenceIds.entries()) {
      const row = byId.get(id)
      if (!row || row.role_type !== roleType) return { error: t('errors.invalidPreference') }
      const weapon = getBuildEntryWeapon(row.data)
      if (!weapon.weapon_id || !weapon.weapon_name) return { error: t('errors.invalidPreference') }
      preferences.push({
        template_id: row.id,
        template_name: row.name,
        role_type: roleType,
        weapon_name: weapon.weapon_name,
        weapon_id: weapon.weapon_id,
        priority: index + 1,
        build_data: row.data,
      })
    }
    if (preferences.length === 0 || preferences.length > MAX_BUILD_SHEET_PREFERENCES) {
      return { error: t('errors.preferenceRequired') }
    }

    const payload = {
      guild_id: guildId,
      event_id: eventId,
      applicant_discord_id: session.discordId,
      applicant_username: session.username,
      role_type: roleType,
      preferences,
      status: 'pending',
      assigned_party_number: null,
      assigned_slot_id: null,
      selected_template_id: null,
      selected_snapshot: null,
      assigned_by: null,
      assigned_at: null,
    }
    const { error } = await db
      .from('event_build_applications')
      .upsert(payload, { onConflict: 'guild_id,event_id,applicant_discord_id' })
    if (error) return { error: await publicActionError(error, 'actions/build-sheet') }

    revalidateBuildSheetSurfaces(eventId)
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/build-sheet') }
  }
}

export async function cancelBuildSheetApplication(eventId: string): BuildSheetActionResult {
  const tErr = await getTranslations('adminActionError')
  const t = await getTranslations('buildSheetRecruitment')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    if (isGuestOutsideEventScope(session, eventId)) {
      return { error: t('errors.guestWrongEvent') }
    }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const { data: current, error: currentError } = await db
      .from('event_build_applications')
      .select('id, status')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('applicant_discord_id', session.discordId)
      .maybeSingle()
    if (currentError) return { error: await publicActionError(currentError, 'actions/build-sheet') }
    if (!current) return {}
    if (current.status === 'assigned') return { error: t('errors.alreadyAssigned') }
    const { error } = await db
      .from('event_build_applications')
      .update({ status: 'cancelled' })
      .eq('guild_id', guildId)
      .eq('id', current.id)
    if (error) return { error: await publicActionError(error, 'actions/build-sheet') }
    revalidateBuildSheetSurfaces(eventId)
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/build-sheet') }
  }
}

export async function assignBuildSheetApplication(input: {
  eventId: string
  applicationId: string
  partyNumber: number
  templateId: string
}): BuildSheetActionResult {
  const tErr = await getTranslations('adminActionError')
  const t = await getTranslations('buildSheetRecruitment')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const event = await loadEventForGuild(input.eventId, guildId)
    if (!event) return { error: tErr('eventNotFound') }
    if (!isBuildSheetMode(event.recruitment_mode)) return { error: t('errors.modeRequired') }
    if (event.battle_started_at) return { error: t('errors.battleStarted') }
    const partyNumber = Number(input.partyNumber)
    if (!Number.isInteger(partyNumber) || partyNumber < 1 || partyNumber > MAX_PARTY_NUMBER) {
      return { error: t('errors.invalidParty') }
    }
    if (!(await canManageBuildSheetParty(event, guildId, partyNumber))) {
      return { error: tErr('unauthorized') }
    }

    const db = getAdminClient()
    const { data: app, error: appError } = await db
      .from('event_build_applications')
      .select('id, applicant_discord_id, applicant_username, role_type, preferences, status')
      .eq('guild_id', guildId)
      .eq('event_id', input.eventId)
      .eq('id', input.applicationId)
      .maybeSingle()
    if (appError) return { error: await publicActionError(appError, 'actions/build-sheet') }
    if (!app || !isBuildSheetRole(app.role_type)) return { error: t('errors.applicationNotFound') }
    if (app.status === 'assigned') return { error: t('errors.alreadyAssigned') }
    if (app.status === 'cancelled') return { error: t('errors.applicationNotFound') }

    const preferences = parseBuildSheetPreferences(app.preferences)
    const selected = preferences.find((p) => p.template_id === input.templateId)
    if (!selected) return { error: t('errors.invalidPreference') }

    const { data: demand, error: demandError } = await db
      .from('event_build_role_demands')
      .select('required_count')
      .eq('guild_id', guildId)
      .eq('event_id', input.eventId)
      .eq('party_number', partyNumber)
      .eq('role_type', app.role_type)
      .maybeSingle()
    if (demandError) return { error: await publicActionError(demandError, 'actions/build-sheet') }
    if (!demand || Number(demand.required_count) <= 0) return { error: t('errors.noDemand') }

    const { count: assignedCount, error: countError } = await db
      .from('event_build_applications')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('event_id', input.eventId)
      .eq('status', 'assigned')
      .eq('assigned_party_number', partyNumber)
      .eq('role_type', app.role_type)
    if (countError) return { error: await publicActionError(countError, 'actions/build-sheet') }
    if ((assignedCount ?? 0) >= Number(demand.required_count)) {
      return { error: t('errors.partyRoleFilled') }
    }

    const { data: duplicate, error: duplicateError } = await db
      .from('slots')
      .select('id, parties!inner(event_id)')
      .eq('guild_id', guildId)
      .eq('parties.event_id', input.eventId)
      .or(`assigned_discord_id.eq.${app.applicant_discord_id},requested_discord_id.eq.${app.applicant_discord_id}`)
      .maybeSingle()
    if (duplicateError) return { error: await publicActionError(duplicateError, 'actions/build-sheet') }
    if (duplicate) return { error: t('errors.alreadyAssigned') }

    const partyId = await getOrCreateParty(input.eventId, guildId, partyNumber)
    const nextSlotNumber = await getNextSlotNumber(partyId, guildId)
    if (nextSlotNumber > 20) return { error: t('errors.partyFull') }

    const buildSlot = applyTemplateToSlotInput(
      emptySlotInput(nextSlotNumber),
      selected.build_data as unknown as SlotTemplateData,
    )
    const row = {
      ...slotToRow(partyId, { ...buildSlot, role_name: app.role_type }, guildId),
      assigned_discord_id: app.applicant_discord_id,
      assigned_username: app.applicant_username,
    }

    const assignmentStamp = new Date().toISOString()
    const resetClaim = async () => {
      await db
        .from('event_build_applications')
        .update({
          status: 'pending',
          assigned_party_number: null,
          assigned_slot_id: null,
          selected_template_id: null,
          selected_snapshot: null,
          assigned_by: null,
          assigned_at: null,
        })
        .eq('guild_id', guildId)
        .eq('id', app.id)
        .is('assigned_slot_id', null)
    }
    const { data: claimedApplication, error: claimError } = await db
      .from('event_build_applications')
      .update({
        status: 'assigned',
        assigned_party_number: partyNumber,
        assigned_slot_id: null,
        selected_template_id: selected.template_id,
        selected_snapshot: selected,
        assigned_by: session.discordId,
        assigned_at: assignmentStamp,
      })
      .eq('guild_id', guildId)
      .eq('id', app.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (claimError) return { error: await publicActionError(claimError, 'actions/build-sheet') }
    if (!claimedApplication) return { error: t('errors.alreadyAssigned') }

    const { count: assignedCountAfterClaim, error: countAfterClaimError } = await db
      .from('event_build_applications')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('event_id', input.eventId)
      .eq('status', 'assigned')
      .eq('assigned_party_number', partyNumber)
      .eq('role_type', app.role_type)
    if (countAfterClaimError) {
      await resetClaim()
      return { error: await publicActionError(countAfterClaimError, 'actions/build-sheet') }
    }
    if ((assignedCountAfterClaim ?? 0) > Number(demand.required_count)) {
      await resetClaim()
      return { error: t('errors.partyRoleFilled') }
    }

    const { data: insertedSlot, error: slotError } = await db
      .from('slots')
      .insert(row)
      .select('id')
      .single()
    if (slotError) {
      await resetClaim()
      return { error: await publicActionError(slotError, 'actions/build-sheet') }
    }

    const { error: updateError } = await db
      .from('event_build_applications')
      .update({
        assigned_slot_id: insertedSlot.id,
      })
      .eq('guild_id', guildId)
      .eq('id', app.id)
    if (updateError) {
      await db.from('slots').delete().eq('guild_id', guildId).eq('id', insertedSlot.id)
      await resetClaim()
      return { error: await publicActionError(updateError, 'actions/build-sheet') }
    }

    revalidateBuildSheetSurfaces(input.eventId)
    revalidatePath(`/events/${input.eventId}/party/${partyNumber}`)
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/build-sheet') }
  }
}

export async function unassignBuildSheetApplication(
  eventId: string,
  applicationId: string,
): BuildSheetActionResult {
  const tErr = await getTranslations('adminActionError')
  const t = await getTranslations('buildSheetRecruitment')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const event = await loadEventForGuild(eventId, guildId)
    if (!event) return { error: tErr('eventNotFound') }
    if (event.battle_started_at) return { error: t('errors.battleStarted') }
    const db = getAdminClient()
    const { data: app, error: appError } = await db
      .from('event_build_applications')
      .select('id, status, assigned_party_number, assigned_slot_id')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('id', applicationId)
      .maybeSingle()
    if (appError) return { error: await publicActionError(appError, 'actions/build-sheet') }
    if (!app || app.status !== 'assigned' || !app.assigned_party_number) return {}
    if (!(await canManageBuildSheetParty(event, guildId, app.assigned_party_number))) {
      return { error: tErr('unauthorized') }
    }
    if (app.assigned_slot_id) {
      const { error: deleteError } = await db
        .from('slots')
        .delete()
        .eq('guild_id', guildId)
        .eq('id', app.assigned_slot_id)
      if (deleteError) return { error: await publicActionError(deleteError, 'actions/build-sheet') }
    }
    const { error } = await db
      .from('event_build_applications')
      .update({
        status: 'pending',
        assigned_party_number: null,
        assigned_slot_id: null,
        selected_template_id: null,
        selected_snapshot: null,
        assigned_by: null,
        assigned_at: null,
      })
      .eq('guild_id', guildId)
      .eq('id', applicationId)
    if (error) return { error: await publicActionError(error, 'actions/build-sheet') }
    revalidateBuildSheetSurfaces(eventId)
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/build-sheet') }
  }
}

async function getOrCreateParty(
  eventId: string,
  guildId: string,
  partyNumber: number,
): Promise<string> {
  const db = getAdminClient()
  const { data: existing, error: lookupError } = await db
    .from('parties')
    .select('id')
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .eq('party_number', partyNumber)
    .maybeSingle()
  if (lookupError) throw new Error(lookupError.message)
  if (existing) return existing.id as string
  const { data: inserted, error } = await db
    .from('parties')
    .insert({ guild_id: guildId, event_id: eventId, party_number: partyNumber })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return inserted.id as string
}

async function getNextSlotNumber(partyId: string, guildId: string): Promise<number> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select('slot_number')
    .eq('guild_id', guildId)
    .eq('party_id', partyId)
    .order('slot_number', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const currentMax = Number(data?.[0]?.slot_number ?? 0)
  return currentMax + 1
}
