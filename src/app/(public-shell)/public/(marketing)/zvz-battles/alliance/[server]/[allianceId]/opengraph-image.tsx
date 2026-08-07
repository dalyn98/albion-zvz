import { ImageResponse } from 'next/og'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import { PublicZvzEntityOgContent } from '@/lib/public-zvz-entity-og'
import { loadPublicAllianceZvzSeasonRecord } from '@/lib/public-zvz-records'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AGM Battles alliance season performance'
export const dynamic = 'force-dynamic'

export default async function AllianceRecordOpenGraphImage({
  params,
}: {
  params: Promise<{ server: string; allianceId: string }>
}) {
  const route = await params
  const record = isAlbionServer(route.server)
    ? await loadPublicAllianceZvzSeasonRecord(route.server, route.allianceId, null, null).catch(() => null)
    : null
  return new ImageResponse(
    <PublicZvzEntityOgContent
      kind="ALLIANCE"
      name={record?.allianceName ?? route.allianceId}
      server={route.server}
      rank={record?.rank ?? null}
      engagements={record?.battles ?? 0}
      kills={record?.kills ?? 0}
      deaths={record?.deaths ?? 0}
      scale={record?.primaryEngagementScale ?? 'ZvZ'}
    />,
    size,
  )
}
