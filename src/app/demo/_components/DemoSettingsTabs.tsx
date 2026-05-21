'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Image as ImageIcon, Shield, Timer, Coins, Building2 } from 'lucide-react'
import { useDemoToast } from './DemoFeedbackProvider'
import { DEMO_GUILD_NAME } from '@/data/demo-seed'

type TabKey = 'guild' | 'permissions' | 'events' | 'regear' | 'landing'

interface TabDef {
  key: TabKey
  labelKey:
    | 'tabGuild'
    | 'tabPermissions'
    | 'tabEvents'
    | 'tabRegear'
    | 'tabLanding'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: readonly TabDef[] = [
  { key: 'guild', labelKey: 'tabGuild', icon: Building2 },
  { key: 'permissions', labelKey: 'tabPermissions', icon: Shield },
  { key: 'events', labelKey: 'tabEvents', icon: Timer },
  { key: 'regear', labelKey: 'tabRegear', icon: Coins },
  { key: 'landing', labelKey: 'tabLanding', icon: ImageIcon },
]

export default function DemoSettingsTabs() {
  const t = useTranslations('adminSettings')
  const tDemo = useTranslations('demo.settings')
  const tFeedback = useTranslations('demo.feedback')
  const { showToast } = useDemoToast()
  const [active, setActive] = useState<TabKey>('guild')

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={t('categoryLabel')}
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {TABS.map(({ key, labelKey, icon: Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Icon size={14} />
              {t(labelKey)}
            </button>
          )
        })}
      </nav>

      <div role="tabpanel">
        {active === 'guild' && (
          <DemoSettingsGroup
            title={t('guildGroupTitle')}
            description={t('guildGroupDescription')}
          >
            <DemoFormRow label={tDemo('homeGuildLabel')} value={DEMO_GUILD_NAME} />
            <DemoFormRow label={tDemo('timezoneLabel')} value="Asia/Seoul" />
            <DemoFormRow
              label={tDemo('unverifiedAccessLabel')}
              value={tDemo('toggleOn')}
              valueKind="toggle"
            />
          </DemoSettingsGroup>
        )}
        {active === 'permissions' && (
          <div className="space-y-4">
            <DemoSettingsGroup title={tDemo('adminRoleTitle')}>
              <DemoTagInput tags={['Officer', 'Caller']} />
            </DemoSettingsGroup>
            <DemoSettingsGroup title={tDemo('eventCreatorRolesTitle')}>
              <DemoTagInput tags={['Officer', 'Caller']} />
            </DemoSettingsGroup>
            <DemoSettingsGroup title={tDemo('activeMemberRolesTitle')}>
              <DemoTagInput tags={['Member', 'Veteran']} />
            </DemoSettingsGroup>
          </div>
        )}
        {active === 'events' && (
          <div className="space-y-4">
            <DemoSettingsGroup
              title={t('eventOpsGroupTitle')}
              description={t('eventOpsGroupDescription')}
            >
              <DemoFormRow
                label={tDemo('eventAutoStartLabel')}
                value={tDemo('toggleOff')}
                valueKind="toggle"
              />
              <DemoFormRow label={tDemo('cdBadgeRolesLabel')} value="DPS" />
            </DemoSettingsGroup>
            <DemoSettingsGroup
              title={t('eventNoticeGroupTitle')}
              description={t('eventNoticeGroupDescription')}
            >
              <DemoFormRow
                label={tDemo('notificationMessageLabel')}
                value="@everyone 21시 정모!"
              />
              <DemoFormRow label={tDemo('eventDmLeadLabel')} value="35 min" />
            </DemoSettingsGroup>
          </div>
        )}
        {active === 'regear' && (
          <DemoSettingsGroup
            title={t('regearGroupTitle')}
            description={t('regearGroupDescription')}
          >
            <DemoFormRow label={tDemo('regearWindowLabel')} value="60 min" />
            <DemoFormRow label={tDemo('regearMaxDeathsLabel')} value="1" />
            <DemoFormRow label={tDemo('regearEligibilityLabel')} value="14d" />
            <DemoFormRow label={tDemo('regearPayoutRateLabel')} value="100%" />
            <DemoFormRow
              label={tDemo('autoRegearLabel')}
              value={tDemo('toggleOn')}
              valueKind="toggle"
            />
            <DemoFormRow
              label={tDemo('craftRegearLabel')}
              value={tDemo('toggleOn')}
              valueKind="toggle"
            />
          </DemoSettingsGroup>
        )}
        {active === 'landing' && (
          <div className="space-y-4">
            <DemoSettingsGroup title={tDemo('landingCtaTextLabel')}>
              <DemoFormRow label="" value="우리 길드와 함께 ZvZ 합시다!" />
            </DemoSettingsGroup>
            <DemoSettingsGroup title={tDemo('landingBannerLabel')}>
              <div className="aspect-[3/1] w-full rounded-md border border-dashed border-gray-700 bg-gray-950 flex items-center justify-center text-xs text-gray-500">
                <ImageIcon size={20} className="mr-2" />
                Banner preview · 1920×640
              </div>
            </DemoSettingsGroup>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => showToast(tFeedback('actionAcknowledged'))}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          {t('save')}
        </button>
      </div>
    </div>
  )
}

function DemoSettingsGroup({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
      <header>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function DemoFormRow({
  label,
  value,
  valueKind = 'text',
}: {
  label: string
  value: string
  valueKind?: 'text' | 'toggle'
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      {label && (
        <span className="text-xs font-medium text-gray-400 sm:w-44 shrink-0">{label}</span>
      )}
      {valueKind === 'toggle' ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-not-allowed">
          {value}
        </span>
      ) : (
        <input
          type="text"
          value={value}
          readOnly
          disabled
          className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 cursor-not-allowed disabled:opacity-80 focus:outline-none"
        />
      )}
    </div>
  )
}

function DemoTagInput({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-gray-700 bg-gray-950 px-3 py-2 cursor-not-allowed opacity-90">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-200 font-mono"
        >
          @{tag}
        </span>
      ))}
      <span className="text-xs text-gray-600">+ Add role</span>
    </div>
  )
}
