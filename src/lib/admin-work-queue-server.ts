import 'server-only'

import { cache } from 'react'
import {
  buildAdminWorkQueueSnapshot,
  type AdminWorkQueueSnapshot,
} from '@/lib/admin-work-queue'
import { getAdminClient } from '@/lib/supabase-admin'

const ADMIN_WORK_QUEUE_RPC = 'admin_work_queue_snapshot'

export const loadAdminWorkQueueSnapshot = cache(
  async (guildId: string): Promise<AdminWorkQueueSnapshot> => {
    const { data, error } = await getAdminClient().rpc(ADMIN_WORK_QUEUE_RPC, {
      p_guild_id: guildId,
    })
    if (error) {
      throw new Error(`ADMIN_WORK_QUEUE_LOAD_FAILED:${error.code ?? 'UNKNOWN'}`)
    }
    return buildAdminWorkQueueSnapshot(
      Array.isArray(data) ? data as Record<string, unknown>[] : [],
    )
  },
)
