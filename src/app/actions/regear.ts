'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { verifyDeathInWindow } from '@/lib/killboard'
import { SLOT_KEYS, getDisplayGear, type BuildSnapshot, type RegearType, type SlotGearDisplay, type SlotKey } from '@/types'

// User-facing regear actions. Admin-side lives in `regear-admin.ts`.

const SCREENSHOT_BUCKET = 'regear-screenshots'
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024 // 10 MiB — must match bucket limit in migration 003
const REGEAR_WINDOW_MINUTES = 60

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

function buildSnapshotFromSlot(slot: SlotGearDisplay, roleName: string): BuildSnapshot {
  const gear = SLOT_KEYS.reduce(
    (acc, k) => {
      const { name, id } = getDisplayGear(slot, k)
      acc[k] = { name: name ?? null, id: id ?? null }
      return acc
    },
    {} as Record<SlotKey, { name: string | null; id: string | null }>,
  )
  return { role_name: roleName || null, ...gear }
}

export interface MyRegearRequest {
  id: string
  event_id: string
  event_title: string
  role_name: string
  silver: number
  request_type: RegearType
  claimed_silver: number | null
  status: 'pending' | 'approved' | 'rejected'
  killboard_verified: boolean
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  build_snapshot: BuildSnapshot | null
}

export interface MyPointsSummary {
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
}

export interface RegearEligibleEvent {
  id: string
  title: string
  gather_time: string
  gather_at: string | null
  gather_location: string
  battle_started_at: string
  role_name: string
  role_reward: number
  already_requested: boolean
}

export async function requestRegear(
  formData: FormData,
): Promise<{ error?: string; id?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }

  const eventId = String(formData.get('eventId') ?? '')
  const file = formData.get('screenshot')
  const claimedSilverRaw = String(formData.get('claimedSilver') ?? '')
  if (!eventId) return { error: tErr('missingEventInfo') }
  if (!(file instanceof File) || file.size === 0) return { error: tErr('screenshotMissing') }
  if (file.size > MAX_SCREENSHOT_BYTES) return { error: tErr('screenshotTooLarge') }
  if (!ALLOWED_MIME.has(file.type)) return { error: tErr('screenshotWrongType') }

  const db = getAdminClient()

  // 1) Must be assigned to a slot with a role in that event. Pull the full
  //    gear so we can snapshot the build — the regear admin uses this to
  //    verify in-game that the member wore what they applied with. Columns
  //    are spelled out because Supabase's select parser needs a literal.
  const { data: slot, error: slotError } = await db
    .from('slots')
    .select(
      'role_name, weapon_name, weapon_id, head_name, head_id, armor_name, armor_id, shoes_name, shoes_id, offhand_name, offhand_id, potion_name, potion_id, food_name, food_id, cape_name, cape_id, assigned_weapon_name, assigned_weapon_id, assigned_head_name, assigned_head_id, assigned_armor_name, assigned_armor_id, assigned_shoes_name, assigned_shoes_id, assigned_offhand_name, assigned_offhand_id, assigned_potion_name, assigned_potion_id, assigned_food_name, assigned_food_id, assigned_cape_name, assigned_cape_id, parties!inner(event_id)',
    )
    .eq('assigned_discord_id', session.discordId)
    .eq('parties.event_id', eventId)
    .maybeSingle()
  if (slotError) return { error: slotError.message }
  if (!slot) return { error: tErr('noAssignedSlot') }
  const roleName = (slot.role_name ?? '').trim()
  if (!roleName) return { error: tErr('slotRoleMissing') }

  const buildSnapshot = buildSnapshotFromSlot(slot as unknown as SlotGearDisplay, roleName)

  // 2) Duplicate request guard (partial; DB partial-unique index is the hard
  //    guard). Only pending/approved rows block re-submission — rejected rows
  //    stay on record for audit but don't lock the user out of retrying.
  const { data: existing, error: existingError } = await db
    .from('regear_requests')
    .select('id')
    .eq('event_id', eventId)
    .eq('discord_id', session.discordId)
    .neq('status', 'rejected')
    .maybeSingle()
  if (existingError) return { error: existingError.message }
  if (existing) return { error: tErr('alreadyRequestedForEvent') }

  // 3) Event window — killboard verify needs a real timestamp. `gather_time`
  //    is free-text so we anchor off `battle_started_at` which the admin sets
  //    at kickoff. No battle start = no regear window yet. Title is captured
  //    here so history survives if the event is later deleted.
  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, battle_started_at')
    .eq('id', eventId)
    .single()
  if (eventError) return { error: eventError.message }
  if (!event.battle_started_at) {
    return { error: tErr('battleNotStarted') }
  }

  // 4) Snapshot the role's silver ceiling. A ceiling of 0 blocks the role
  //    from regear entirely; admin must set it in the settings page first.
  const { data: reward, error: rewardError } = await db
    .from('role_rewards')
    .select('silver')
    .eq('role_name', roleName)
    .maybeSingle()
  if (rewardError) return { error: rewardError.message }
  const silver = reward?.silver ?? 0
  if (silver <= 0) {
    return { error: tErr('ceilingNotSetForRole') }
  }

  // 4a) Validate the member's claimed amount against the ceiling.
  const claimedSilver = Number(claimedSilverRaw.replace(/,/g, '').trim())
  if (!Number.isFinite(claimedSilver) || !Number.isInteger(claimedSilver) || claimedSilver <= 0) {
    return { error: tErr('invalidClaimAmount') }
  }
  if (claimedSilver > silver) {
    return { error: tErr('claimOverCeiling', { ceiling: silver.toLocaleString() }) }
  }

  // 5) Upload screenshot first — if the DB insert below fails, an orphaned
  //    file is far cheaper to clean up than a phantom request row.
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${session.discordId}/${eventId}-${Date.now()}.${ext}`
  const { error: uploadError } = await db.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) return { error: tErr('screenshotUploadFailed', { reason: uploadError.message }) }

  // 6) Killboard verification (hint-only — admin still reviews).
  const windowStart = new Date(event.battle_started_at)
  const windowEnd = new Date(windowStart.getTime() + REGEAR_WINDOW_MINUTES * 60 * 1000)
  const kbResult = await verifyDeathInWindow(
    session.username,
    windowStart.toISOString(),
    windowEnd.toISOString(),
  )

  // 7) Insert the request. request_type column defaults to 'death' in the DB
  //    for backwards compatibility; application code no longer branches on it
  //    after migration 018 unified the flow.
  const { data: inserted, error: insertError } = await db
    .from('regear_requests')
    .insert({
      event_id: eventId,
      event_title_snapshot: event.title,
      discord_id: session.discordId,
      username: session.username,
      role_name: roleName,
      silver,
      claimed_silver: claimedSilver,
      screenshot_path: path,
      killboard_verified: kbResult.verified,
      killboard_event_id: kbResult.matchedEventId,
      admin_notes: kbResult.reason, // Shown to admin as the killboard hint.
      build_snapshot: buildSnapshot,
    })
    .select('id')
    .single()
  if (insertError) {
    // Best-effort cleanup so we don't leak orphaned screenshots.
    await db.storage.from(SCREENSHOT_BUCKET).remove([path])
    return { error: insertError.message }
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/me')
  return { id: inserted.id }
}

export async function cancelMyRegearRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }

  const db = getAdminClient()
  const { data: row, error: fetchError } = await db
    .from('regear_requests')
    .select('id, status, discord_id, event_id, screenshot_path')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: fetchError.message }
  if (!row) return { error: tErr('requestNotFound') }
  if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnCancel') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotCancel') }

  const { error: deleteError } = await db
    .from('regear_requests')
    .delete()
    .eq('id', id)
    .eq('status', 'pending')
  if (deleteError) return { error: deleteError.message }

  // Best-effort screenshot cleanup. If this fails we continue — the nightly
  // cron already has a separate sweep for orphaned files.
  if (row.screenshot_path) {
    await db.storage.from(SCREENSHOT_BUCKET).remove([row.screenshot_path])
  }

  if (row.event_id) revalidatePath(`/events/${row.event_id}`)
  revalidatePath('/regear')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/regear')
  return {}
}

export async function listMyRegearRequests(): Promise<{
  requests: MyRegearRequest[]
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const tCommon = await getTranslations('common')
  const session = await getSession()
  if (!session) return { requests: [], error: tErr('loginRequired') }

  const db = getAdminClient()
  const { data, error } = await db
    .from('regear_requests')
    .select(
      'id, event_id, event_title_snapshot, role_name, silver, request_type, claimed_silver, status, killboard_verified, admin_notes, created_at, resolved_at, build_snapshot, events(title)',
    )
    .eq('discord_id', session.discordId)
    .order('created_at', { ascending: false })
  if (error) return { requests: [], error: error.message }

  const deletedEventLabel = tCommon('deletedEvent')
  const requests: MyRegearRequest[] = (data ?? []).map((row) => {
    const event = row.events as { title?: string } | { title?: string }[] | null
    const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
    return {
      id: row.id,
      event_id: row.event_id ?? '',
      event_title: liveTitle || row.event_title_snapshot || deletedEventLabel,
      role_name: row.role_name,
      silver: row.silver,
      request_type: (row.request_type ?? 'death') as RegearType,
      claimed_silver: row.claimed_silver,
      status: row.status as MyRegearRequest['status'],
      killboard_verified: row.killboard_verified,
      admin_notes: row.admin_notes,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      build_snapshot: (row.build_snapshot as BuildSnapshot | null) ?? null,
    }
  })
  return { requests }
}

export async function listMyRegearEligibleEvents(): Promise<{
  events: RegearEligibleEvent[]
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { events: [], error: tErr('loginRequired') }
  if (!session.isMember) return { events: [], error: tErr('memberOnlyRegear') }

  const db = getAdminClient()

  // Find slots I'm assigned to, joined through parties to events with a battle
  // start. Battle start is the gate — no start means no regear window yet.
  // We don't gate by isEnded here: members can still submit from the site after
  // the in-game 1-hour window (the cutoff is for the screenshot itself).
  const { data: slots, error: slotError } = await db
    .from('slots')
    .select('role_name, party_id')
    .eq('assigned_discord_id', session.discordId)
  if (slotError) return { events: [], error: slotError.message }
  if (!slots || slots.length === 0) return { events: [] }

  const { data: parties, error: partiesError } = await db
    .from('parties')
    .select('id, event_id')
    .in(
      'id',
      slots.map((s) => s.party_id),
    )
  if (partiesError) return { events: [], error: partiesError.message }
  if (!parties || parties.length === 0) return { events: [] }

  const partyToEvent = new Map(parties.map((p) => [p.id, p.event_id]))
  const eventIds = Array.from(new Set(parties.map((p) => p.event_id)))

  const { data: events, error: eventsError } = await db
    .from('events')
    .select('id, title, gather_time, gather_at, gather_location, battle_started_at')
    .in('id', eventIds)
    .not('battle_started_at', 'is', null)
    .order('battle_started_at', { ascending: false })
  if (eventsError) return { events: [], error: eventsError.message }
  if (!events || events.length === 0) return { events: [] }

  const eventIdSet = new Set(events.map((e) => e.id))

  // Map each event to my role (first matching slot wins — a member shouldn't
  // hold multiple slots in one event, but guard against it anyway).
  const eventToRole = new Map<string, string>()
  for (const slot of slots) {
    const eventId = partyToEvent.get(slot.party_id)
    if (!eventId || !eventIdSet.has(eventId)) continue
    const role = (slot.role_name ?? '').trim()
    if (!role) continue
    if (!eventToRole.has(eventId)) eventToRole.set(eventId, role)
  }

  const roleNames = Array.from(new Set(Array.from(eventToRole.values())))
  const [rewardRes, requestRes] = await Promise.all([
    roleNames.length > 0
      ? db.from('role_rewards').select('role_name, silver').in('role_name', roleNames)
      : Promise.resolve({ data: [] as { role_name: string; silver: number }[], error: null }),
    db
      .from('regear_requests')
      .select('event_id')
      .eq('discord_id', session.discordId)
      .neq('status', 'rejected')
      .in('event_id', Array.from(eventIdSet)),
  ])
  if (rewardRes.error) return { events: [], error: rewardRes.error.message }
  if (requestRes.error) return { events: [], error: requestRes.error.message }

  const rewardMap = new Map((rewardRes.data ?? []).map((r) => [r.role_name, r.silver]))
  const requestedSet = new Set((requestRes.data ?? []).map((r) => r.event_id))

  const result: RegearEligibleEvent[] = events
    .filter((e) => eventToRole.has(e.id))
    .map((e) => {
      const role = eventToRole.get(e.id) ?? ''
      return {
        id: e.id,
        title: e.title,
        gather_time: e.gather_time,
        gather_at: e.gather_at,
        gather_location: e.gather_location,
        battle_started_at: e.battle_started_at as string,
        role_name: role,
        role_reward: rewardMap.get(role) ?? 0,
        already_requested: requestedSet.has(e.id),
      }
    })

  return { events: result }
}

export async function getMyPointsSummary(): Promise<{
  summary?: MyPointsSummary
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }

  const db = getAdminClient()
  const { data, error } = await db
    .from('point_ledger')
    .select('delta')
    .eq('discord_id', session.discordId)
  if (error) return { error: error.message }

  let earned = 0
  let spent = 0
  for (const row of data ?? []) {
    if (row.delta >= 0) earned += row.delta
    else spent += -row.delta
  }
  return { summary: { balance: earned - spent, lifetimeEarned: earned, lifetimeSpent: spent } }
}
