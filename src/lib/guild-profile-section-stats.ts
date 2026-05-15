import { getAdminClient } from '@/lib/supabase-admin'
import { loadTrackedBattleLifetimeCount } from '@/lib/guild-profile-activity'

interface SectionStat {
  count: number
}

export interface SectionStats {
  members: SectionStat | null
  battles: SectionStat | null
  regear: SectionStat | null
}

// 멀티테넌트 마이그레이션 (072) 에서 이 테이블들의 컬럼이 guild_id 로 통일됐다.
// 이전 코드에서 tenant_id 로 잘못 필터해 silent 0 으로 떨어지던 버그 수정.
// guild_avatars 는 PK 가 (guild_id, discord_id) 복합으로 바뀌어 (084) 단일
// 'id' 컬럼이 없다 — head:true 카운트는 select 컬럼이 존재해야 하므로 '*' 사용.
// battles 카운트는 events.battle_started_at 이 아니라 tenant_battle_records 기반
// (low-engagement 컷 + bundle_split 토글 적용) 으로 /battles 페이지와 일치시킴.
export async function loadSectionStats(
  guildId: string,
  flags: { showMembers: boolean; showBattles: boolean; showRegearStats: boolean },
): Promise<SectionStats> {
  const db = getAdminClient()

  const [members, battlesCount, regear] = await Promise.all([
    flags.showMembers
      ? db
          .from('guild_avatars')
          .select('*', { count: 'exact', head: true })
          .eq('guild_id', guildId)
          .is('withdrawn_at', null)
      : Promise.resolve({ count: null }),
    flags.showBattles
      ? loadTrackedBattleLifetimeCount(guildId)
      : Promise.resolve(null),
    flags.showRegearStats
      ? db
          .from('regear_requests')
          .select('*', { count: 'exact', head: true })
          .eq('guild_id', guildId)
          .eq('status', 'approved')
      : Promise.resolve({ count: null }),
  ])

  return {
    members: typeof members.count === 'number' ? { count: members.count } : null,
    battles: typeof battlesCount === 'number' ? { count: battlesCount } : null,
    regear: typeof regear.count === 'number' ? { count: regear.count } : null,
  }
}
