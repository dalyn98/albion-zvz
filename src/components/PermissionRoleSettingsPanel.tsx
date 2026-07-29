'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import ActiveMemberRolesSetting from './ActiveMemberRolesSetting'
import SettingsGroup from './SettingsGroup'

interface Props {
  activeMemberRoleIds: string[]
  lastMemberSyncAt: string | null
  timezone: string
}

export default function PermissionRoleSettingsPanel({
  activeMemberRoleIds,
  lastMemberSyncAt,
  timezone,
}: Props) {
  const t = useTranslations('permissions.roleSettings')

  return (
    <SettingsGroup title={t('title')} description={t('description')}>
      <div className="rounded-xl bg-amber-500/5 p-3 shadow-[0_0_0_1px_rgba(245,158,11,0.22)]">
        <p className="text-pretty text-sm text-gray-300">
          {t('capabilityNotice')}
        </p>
        <Link
          href="/admin/dashboard/permissions"
          className="mt-2 inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.3)] transition-transform active:scale-[0.96]"
        >
          {t('openCapabilityManager')}
        </Link>
      </div>
      <ActiveMemberRolesSetting
        initialRoleIds={activeMemberRoleIds}
        initialLastSyncAt={lastMemberSyncAt}
        timezone={timezone}
        embedded
      />
    </SettingsGroup>
  )
}
