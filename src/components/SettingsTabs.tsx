'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Bell, Coins, Image as ImageIcon } from 'lucide-react'
import NotificationSettingsForm from './NotificationSettingsForm'
import RoleRewardsEditor from './RoleRewardsEditor'
import LandingBannerForm from './LandingBannerForm'
import LandingCtaTextForm from './LandingCtaTextForm'
import type { RoleReward } from '@/app/actions/regear-admin'

type TabKey = 'notifications' | 'rewards' | 'landing'

interface TabDef {
  key: TabKey
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: readonly TabDef[] = [
  { key: 'notifications', label: '이벤트 알림', icon: Bell },
  { key: 'rewards', label: '역할별 리기어 금액', icon: Coins },
  { key: 'landing', label: '대문 페이지', icon: ImageIcon },
]

const DEFAULT_TAB: TabKey = 'notifications'

interface Props {
  notificationMessage: string
  rewards: RoleReward[]
  rewardsError?: string
  landingBannerUrl: string
  landingCtaText: string
  defaultLandingCtaText: string
}

function isTabKey(value: string | null): value is TabKey {
  return value === 'notifications' || value === 'rewards' || value === 'landing'
}

export default function SettingsTabs({
  notificationMessage,
  rewards,
  rewardsError,
  landingBannerUrl,
  landingCtaText,
  defaultLandingCtaText,
}: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const rawTab = searchParams.get('tab')
  const active: TabKey = isTabKey(rawTab) ? rawTab : DEFAULT_TAB

  const selectTab = (next: TabKey) => {
    if (next === active) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_TAB) params.delete('tab')
    else params.set('tab', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label="설정 카테고리"
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          )
        })}
      </nav>

      <div role="tabpanel">
        {active === 'notifications' && (
          <NotificationSettingsForm initialMessage={notificationMessage} />
        )}
        {active === 'rewards' && (
          <div className="space-y-3">
            <p className="text-gray-500 text-xs">
              역할별 리기어 청구 상한입니다. 길드원은 이 금액 이하 범위에서 직접 청구 금액을 입력해 신청하고, 승인 시 청구 금액이 포인트로 지급됩니다. 상한이 0인 역할은 리기어 신청이 차단됩니다.
            </p>
            {rewardsError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                <p className="text-red-400 text-sm">{rewardsError}</p>
              </div>
            )}
            <RoleRewardsEditor rewards={rewards} />
          </div>
        )}
        {active === 'landing' && (
          <div className="space-y-4">
            <LandingCtaTextForm
              initialText={landingCtaText}
              defaultText={defaultLandingCtaText}
            />
            <LandingBannerForm currentUrl={landingBannerUrl} />
          </div>
        )}
      </div>
    </div>
  )
}
