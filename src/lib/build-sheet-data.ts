import { getAdminClient } from '@/lib/supabase-admin'
import {
  getBuildEntryWeapon,
  isBuildSheetRole,
  parseBuildSheetPreferences,
  type BuildSheetApplication,
  type BuildSheetEntry,
  type BuildSheetPartyAssigner,
  type BuildSheetPreferenceSnapshot,
  type BuildSheetRoleDemand,
} from '@/lib/build-sheet'

type BuildTemplateRow = {
  id: string
  name: string
  data: Record<string, unknown> | null
  created_at: string
  role_type: string | null
}

type DemandRow = {
  party_number: number
  role_type: string
  required_count: number
}

type AssignerRow = {
  party_number: number
  caller_discord_id: string
}

type ApplicationRow = {
  id: string
  applicant_discord_id: string
  applicant_username: string
  role_type: string
  preferences: unknown
  status: string
  assigned_party_number: number | null
  assigned_slot_id: string | null
  selected_template_id: string | null
  selected_snapshot: unknown
  assigned_by: string | null
  assigned_at: string | null
  created_at: string
}

export interface BuildSheetEventState {
  entries: BuildSheetEntry[]
  demands: BuildSheetRoleDemand[]
  assigners: BuildSheetPartyAssigner[]
  applications: BuildSheetApplication[]
}

export async function listBuildSheetEntries(guildId: string): Promise<BuildSheetEntry[]> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('slot_templates')
    .select('id, name, data, created_at, role_type:data->>role_name')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  return ((data ?? []) as BuildTemplateRow[])
    .map((row): BuildSheetEntry | null => {
      const buildData = row.data ?? {}
      const weapon = getBuildEntryWeapon(buildData)
      if (!isBuildSheetRole(row.role_type)) return null
      if (!weapon.weapon_id || !weapon.weapon_name) return null
      return {
        id: row.id,
        name: row.name,
        role_type: row.role_type,
        weapon_name: weapon.weapon_name,
        weapon_id: weapon.weapon_id,
        data: buildData,
        created_at: row.created_at,
      }
    })
    .filter((entry): entry is BuildSheetEntry => entry !== null)
}

export async function loadBuildSheetEventState(
  eventId: string,
  guildId: string,
  options: { includeApplications?: boolean } = {},
): Promise<BuildSheetEventState> {
  const db = getAdminClient()
  const [entries, demandRes, assignerRes, applicationRes] = await Promise.all([
    listBuildSheetEntries(guildId),
    db
      .from('event_build_role_demands')
      .select('party_number, role_type, required_count')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .order('party_number'),
    db
      .from('event_build_party_assigners')
      .select('party_number, caller_discord_id')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .order('party_number'),
    options.includeApplications
      ? db
          .from('event_build_applications')
          .select('id, applicant_discord_id, applicant_username, role_type, preferences, status, assigned_party_number, assigned_slot_id, selected_template_id, selected_snapshot, assigned_by, assigned_at, created_at')
          .eq('guild_id', guildId)
          .eq('event_id', eventId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as ApplicationRow[], error: null }),
  ])
  if (demandRes.error) throw new Error(demandRes.error.message)
  if (assignerRes.error) throw new Error(assignerRes.error.message)
  if (applicationRes.error) throw new Error(applicationRes.error.message)

  const demands = ((demandRes.data ?? []) as DemandRow[]).flatMap((row) => {
    if (!isBuildSheetRole(row.role_type)) return []
    return [{
      party_number: row.party_number,
      role_type: row.role_type,
      required_count: row.required_count,
    }]
  })

  const assigners = ((assignerRes.data ?? []) as AssignerRow[]).map((row) => ({
    party_number: row.party_number,
    caller_discord_id: row.caller_discord_id,
  }))

  const applications = ((applicationRes.data ?? []) as ApplicationRow[]).flatMap((row): BuildSheetApplication[] => {
    if (!isBuildSheetRole(row.role_type)) return []
    return [{
      id: row.id,
      applicant_discord_id: row.applicant_discord_id,
      applicant_username: row.applicant_username,
      role_type: row.role_type,
      preferences: parseBuildSheetPreferences(row.preferences),
      status: row.status === 'assigned' ? 'assigned' : row.status === 'cancelled' ? 'cancelled' : 'pending',
      assigned_party_number: row.assigned_party_number,
      assigned_slot_id: row.assigned_slot_id,
      selected_template_id: row.selected_template_id,
      selected_snapshot: parseSinglePreference(row.selected_snapshot),
      assigned_by: row.assigned_by,
      assigned_at: row.assigned_at,
      created_at: row.created_at,
    }]
  })

  return { entries, demands, assigners, applications }
}

export async function getBuildSheetAssignedPartyNumbers(
  eventId: string,
  guildId: string,
  discordId: string,
): Promise<number[]> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('event_build_party_assigners')
    .select('party_number')
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .eq('caller_discord_id', discordId)
    .order('party_number')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.party_number as number)
}

function parseSinglePreference(raw: unknown): BuildSheetPreferenceSnapshot | null {
  const parsed = parseBuildSheetPreferences(raw ? [raw] : [])
  return parsed[0] ?? null
}
