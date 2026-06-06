'use client'

import dynamic from 'next/dynamic'

const RealtimeKillboardListener = dynamic(
  () => import('@/components/RealtimeKillboardListener'),
  { ssr: false },
)

interface Props {
  guildId: string
  minRefreshIntervalMs?: number
}

export default function RealtimeKillboardListenerLazy(props: Props) {
  return <RealtimeKillboardListener {...props} />
}
