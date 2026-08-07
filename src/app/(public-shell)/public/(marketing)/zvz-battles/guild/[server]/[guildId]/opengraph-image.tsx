import { ImageResponse } from 'next/og'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import { PublicZvzEntityOgContent } from '@/lib/public-zvz-entity-og'
import { loadPublicGuildZvzSeasonRecord } from '@/lib/public-zvz-records'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AGM Battles guild season performance'
export const dynamic = 'force-dynamic'

export default async function GuildRecordOpenGraphImage({
  params,
}: {
  params: Promise<{ server: string; guildId: string }>
}) {
  const route = await params
  const record = isAlbionServer(route.server)
    ? await loadPublicGuildZvzSeasonRecord(route.server, route.guildId, null, null).catch(() => null)
    : null
  return new ImageResponse(
    <PublicZvzEntityOgContent
      kind="GUILD"
      name={record?.guildName ?? route.guildId}
      server={route.server}
      rank={record?.sampleStatus === 'ranked' ? record.rank : null}
      engagements={record?.zvzBattles ?? 0}
      kills={record?.kills ?? 0}
      deaths={record?.deaths ?? 0}
      scale={record?.primaryEngagementScale ?? record?.division ?? 'ZvZ'}
    />,
    size,
  )
}
