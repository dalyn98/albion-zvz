import { getTranslations } from 'next-intl/server'
import EventGuestManagementBootstrap from '@/components/EventGuestManagementBootstrap'

export const dynamic = 'force-dynamic'

export default async function EventGuestManagementPage() {
  const t = await getTranslations('eventGuestManagement')

  return (
    <EventGuestManagementBootstrap
      labels={{
        openingTitle: t('openingTitle'),
        openingDescription: t('openingDescription'),
        unavailableTitle: t('unavailableTitle'),
        unavailableDescription: t('unavailableDescription'),
        retry: t('retry'),
        backHome: t('backHome'),
      }}
    />
  )
}
