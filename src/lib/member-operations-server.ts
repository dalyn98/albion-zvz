import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import type { MemberTrialStatus } from '@/lib/member-operations'
import {
  selectPagedRowsOrThrow,
  type SupabasePagedQuery,
} from '@/lib/supabase-pagination'

export interface MemberTrialProfile {
  discordId: string
  status: MemberTrialStatus
  startedOn: string
  reviewDueOn: string
  notes: string
  resolvedAt: string | null
  updatedBy: string
  updatedAt: string
}

export interface MemberAbsenceRecord {
  id: string
  discordId: string
  startsOn: string
  endsOn: string
  reason: string
  createdAt: string
}

interface MemberAbsenceRow {
  id: string
  discord_id: string
  starts_on: string
  ends_on: string
  reason: string | null
  created_at: string
}

function absenceRecord(row: MemberAbsenceRow): MemberAbsenceRecord {
  return {
    id: row.id,
    discordId: row.discord_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    reason: row.reason ?? '',
    createdAt: row.created_at,
  }
}

export async function loadMemberTrialProfile(
  guildId: string,
  discordId: string,
): Promise<MemberTrialProfile | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('member_trial_profiles')
    .select('discord_id, status, started_on, review_due_on, notes, resolved_at, updated_by, updated_at')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    discordId: data.discord_id as string,
    status: data.status as MemberTrialStatus,
    startedOn: data.started_on as string,
    reviewDueOn: data.review_due_on as string,
    notes: (data.notes as string | null) ?? '',
    resolvedAt: (data.resolved_at as string | null) ?? null,
    updatedBy: data.updated_by as string,
    updatedAt: data.updated_at as string,
  }
}

export async function loadMemberAbsences(
  guildId: string,
  discordId: string,
  fromDateIso: string,
): Promise<MemberAbsenceRecord[]> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('member_absences')
    .select('id, discord_id, starts_on, ends_on, reason, created_at')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .gte('ends_on', fromDateIso)
    .order('starts_on', { ascending: true })
    .limit(10)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    discordId: row.discord_id as string,
    startsOn: row.starts_on as string,
    endsOn: row.ends_on as string,
    reason: (row.reason as string | null) ?? '',
    createdAt: row.created_at as string,
  }))
}

export async function listMemberAbsencesForDate(
  guildId: string,
  discordIds: readonly string[],
  dateIso: string,
): Promise<MemberAbsenceRecord[]> {
  const uniqueIds = [...new Set(discordIds.filter(Boolean))]
  if (uniqueIds.length === 0) return []
  const db = getAdminClient()
  const rows = await selectPagedRowsOrThrow<MemberAbsenceRow>({
    label: 'event member absences',
    buildQuery: () =>
      db
        .from('member_absences')
        .select('id, discord_id, starts_on, ends_on, reason, created_at')
        .eq('guild_id', guildId)
        .in('discord_id', uniqueIds)
        .lte('starts_on', dateIso)
        .gte('ends_on', dateIso)
        .order('discord_id', { ascending: true })
        .order('starts_on', { ascending: true })
        .order('id', { ascending: true }) as unknown as SupabasePagedQuery<MemberAbsenceRow>,
  })
  return rows.map(absenceRecord)
}

export async function loadMemberOperationSummaryMap(
  guildId: string,
  discordIds: readonly string[],
  fromDateIso: string,
): Promise<Map<string, {
  trial: MemberTrialProfile | null
  nextAbsence: MemberAbsenceRecord | null
}>> {
  const uniqueIds = [...new Set(discordIds.filter(Boolean))]
  const result = new Map<string, {
    trial: MemberTrialProfile | null
    nextAbsence: MemberAbsenceRecord | null
  }>()
  for (const discordId of uniqueIds) {
    result.set(discordId, { trial: null, nextAbsence: null })
  }
  if (uniqueIds.length === 0) return result

  const db = getAdminClient()
  const [trialsRes, absenceRows] = await Promise.all([
    db
      .from('member_trial_profiles')
      .select('discord_id, status, started_on, review_due_on, notes, resolved_at, updated_by, updated_at')
      .eq('guild_id', guildId)
      .in('discord_id', uniqueIds),
    selectPagedRowsOrThrow<MemberAbsenceRow>({
      label: 'member operation summaries',
      buildQuery: () =>
        db
          .from('member_absences')
          .select('id, discord_id, starts_on, ends_on, reason, created_at')
          .eq('guild_id', guildId)
          .in('discord_id', uniqueIds)
          .gte('ends_on', fromDateIso)
          .order('discord_id', { ascending: true })
          .order('starts_on', { ascending: true })
          .order('id', { ascending: true }) as unknown as SupabasePagedQuery<MemberAbsenceRow>,
    }),
  ])
  if (trialsRes.error) throw new Error(trialsRes.error.message)

  for (const row of trialsRes.data ?? []) {
    const current = result.get(row.discord_id as string)
    if (!current) continue
    current.trial = {
      discordId: row.discord_id as string,
      status: row.status as MemberTrialStatus,
      startedOn: row.started_on as string,
      reviewDueOn: row.review_due_on as string,
      notes: (row.notes as string | null) ?? '',
      resolvedAt: (row.resolved_at as string | null) ?? null,
      updatedBy: row.updated_by as string,
      updatedAt: row.updated_at as string,
    }
  }
  for (const row of absenceRows) {
    const current = result.get(row.discord_id)
    if (!current || current.nextAbsence) continue
    current.nextAbsence = absenceRecord(row)
  }
  return result
}
