import 'server-only'

import { revalidatePath } from 'next/cache'
import { isAllianceContentComplianceAvailable } from '@/lib/alliance-content-compliance-access'
import {
  isAllianceContentRegearLinkInput,
  type AllianceContentRegearLinkInput,
  type AllianceContentRegearSubmitStatus,
} from '@/lib/alliance-content-regear-video'
import { log } from '@/lib/log'
import { getAdminClient } from '@/lib/supabase-admin'

interface SubmitRegearVideoForAllianceContentInput {
  guildId: string
  discordId: string
  regearRequestId: string
  link: AllianceContentRegearLinkInput | null
}

export async function submitRegearVideoForAllianceContent({
  guildId,
  discordId,
  regearRequestId,
  link,
}: SubmitRegearVideoForAllianceContentInput): Promise<AllianceContentRegearSubmitStatus | null> {
  if (!isAllianceContentRegearLinkInput(link)) return null
  if (!(await isAllianceContentComplianceAvailable(guildId))) return 'failed'

  const { error } = await getAdminClient().rpc('submit_alliance_content_video_from_regear', {
    p_guild_id: guildId,
    p_regear_request_id: regearRequestId,
    p_requirement_id: link.requirementId,
    p_session_id: link.sessionId,
    p_discord_id: discordId,
  })
  if (error) {
    log.warn('[alliance-content] regear video bridge failed', {
      tenant_id: guildId,
      discord_id: discordId,
      regear_request_id: regearRequestId,
      error_code: error.code,
    })
    return 'failed'
  }

  revalidatePath('/admin/dashboard/content-compliance')
  revalidatePath('/me/content-compliance')
  return 'submitted'
}
