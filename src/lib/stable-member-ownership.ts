import type { getAdminClient } from '@/lib/supabase-admin'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

export interface StableMemberOwnership {
  guildMemberId: string | null
  error?: string
}

export function accessIdentityType(subjectId: string): 'local' | 'discord' {
  return subjectId.startsWith('local:') ? 'local' : 'discord'
}

export async function resolveStableMemberOwnership(
  db: SupabaseAdminClient,
  guildId: string,
  subjectId: string,
): Promise<StableMemberOwnership> {
  const { data, error } = await db.rpc('resolve_guild_member_id', {
    p_guild_id: guildId,
    p_identity_type: accessIdentityType(subjectId),
    p_subject_id: subjectId,
  })
  if (error) return { guildMemberId: null, error: error.message }
  return {
    guildMemberId: typeof data === 'string' && data ? data : null,
  }
}

export function isSameStableMemberOwner(input: {
  currentGuildMemberId: string | null
  currentSubjectId: string
  rowGuildMemberId: string | null | undefined
  rowSubjectId: string | null | undefined
}): boolean {
  if (input.currentGuildMemberId && input.rowGuildMemberId) {
    return input.currentGuildMemberId === input.rowGuildMemberId
  }
  return input.currentSubjectId === input.rowSubjectId
}
