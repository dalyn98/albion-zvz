'use client'

import { useTranslations } from 'next-intl'
import ActiveMemberRolesSetting from './ActiveMemberRolesSetting'
import AdminRoleSetting from './AdminRoleSetting'
import BombSquadCallerRolesSetting from './BombSquadCallerRolesSetting'
import EventCreatorRolesGroup from './EventCreatorRolesGroup'
import SettingsGroup from './SettingsGroup'

interface Props {
  adminRoleIds: string[]
  eventCreatorRoleIds: string[]
  eventCreatorCombatRoleIds: string[]
  eventCreatorFfRoleIds: string[]
  eventCreatorGankingRoleIds: string[]
  bombSquadCallerRoleIds: string[]
  activeMemberRoleIds: string[]
  lastMemberSyncAt: string | null
  timezone: string
}

export default function PermissionRoleSettingsPanel({
  adminRoleIds,
  eventCreatorRoleIds,
  eventCreatorCombatRoleIds,
  eventCreatorFfRoleIds,
  eventCreatorGankingRoleIds,
  bombSquadCallerRoleIds,
  activeMemberRoleIds,
  lastMemberSyncAt,
  timezone,
}: Props) {
  const t = useTranslations('permissions.roleSettings')

  return (
    <SettingsGroup title={t('title')} description={t('description')}>
      <AdminRoleSetting initialRoleIds={adminRoleIds} embedded />
      <EventCreatorRolesGroup
        legacyRoleIds={eventCreatorRoleIds}
        combatRoleIds={eventCreatorCombatRoleIds}
        ffRoleIds={eventCreatorFfRoleIds}
        gankingRoleIds={eventCreatorGankingRoleIds}
      />
      <BombSquadCallerRolesSetting initialRoleIds={bombSquadCallerRoleIds} embedded />
      <ActiveMemberRolesSetting
        initialRoleIds={activeMemberRoleIds}
        initialLastSyncAt={lastMemberSyncAt}
        timezone={timezone}
        embedded
      />
    </SettingsGroup>
  )
}
