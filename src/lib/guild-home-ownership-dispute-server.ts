import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import type { GuildHomeOwnershipDisputeStatus } from '@/lib/guild-home-ownership-dispute'

export interface GuildHomeOwnershipDisputeSummary {
  id: string
  albionServer: string
  albionGuildName: string
  incumbentGuildId: string
  claimantGuildId: string
  reporterDiscordId: string
  status: GuildHomeOwnershipDisputeStatus
  evidenceSummary: string | null
  resolutionNote: string | null
  submittedAt: string
  reviewedAt: string | null
  resolvedAt: string | null
}

export async function isGuildHomeOwnershipUnderReview(
  guildId: string,
): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('guild_home_ownership_disputes')
    .select('id')
    .eq('incumbent_guild_id', guildId)
    .eq('status', 'under_review')
    .limit(1)
  if (error) throw new Error(`HOME_GUILD_DISPUTE_LOAD_FAILED:${error.code}`)
  return (data?.length ?? 0) > 0
}

export async function listGuildHomeOwnershipDisputes(): Promise<
  GuildHomeOwnershipDisputeSummary[]
> {
  const { data, error } = await getAdminClient()
    .from('guild_home_ownership_disputes')
    .select(
      'id,albion_server,albion_guild_name,incumbent_guild_id,claimant_guild_id,reporter_discord_id,status,evidence_summary,resolution_note,submitted_at,reviewed_at,resolved_at',
    )
    .order('submitted_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`HOME_GUILD_DISPUTE_LIST_FAILED:${error.code}`)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    albionServer: row.albion_server as string,
    albionGuildName: row.albion_guild_name as string,
    incumbentGuildId: row.incumbent_guild_id as string,
    claimantGuildId: row.claimant_guild_id as string,
    reporterDiscordId: row.reporter_discord_id as string,
    status: row.status as GuildHomeOwnershipDisputeStatus,
    evidenceSummary: (row.evidence_summary as string | null) ?? null,
    resolutionNote: (row.resolution_note as string | null) ?? null,
    submittedAt: row.submitted_at as string,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
  }))
}
