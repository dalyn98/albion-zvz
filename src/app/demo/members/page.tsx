import { getTranslations } from 'next-intl/server'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import { DemoMembersTable } from '../_components/MembersTable'

export default async function DemoMembersPage() {
  const t = await getTranslations('demo')

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-end justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('members.title')}</h1>
          <span className="text-[11px] text-gray-500">
            {t('members.memberCount', { count: DEMO_MEMBERS.length })}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-gray-500">{t('members.subtitle')}</p>
      </header>

      <DemoMembersTable members={DEMO_MEMBERS} />

      <p className="text-[11px] text-gray-600 italic px-1">{t('members.demoOnlyDetail')}</p>
    </div>
  )
}
