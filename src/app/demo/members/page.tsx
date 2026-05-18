import { getTranslations } from 'next-intl/server'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import { DemoMembersTable } from '../_components/MembersTable'
import DemoMembersPageTabs from '../_components/DemoMembersPageTabs'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import DemoCTACard from '../_components/DemoCTACard'

const MEMBERS_TOUR_STEPS = [
  { id: 'members-header' },
  { id: 'members-tabs' },
] as const

// 실제 /members 페이지 비주얼 클론 — 4탭 (members/roster/guests/withdrawn).
// members 탭만 진짜 시드, 나머지 3탭은 기능 범위를 보여주는 정적 placeholder.
export default async function DemoMembersPage() {
  const [t, tDemo, tCta] = await Promise.all([
    getTranslations('members'),
    getTranslations('demo'),
    getTranslations('demo.ctaCard'),
  ])

  const totalParticipation = DEMO_MEMBERS.reduce(
    (sum, m) => sum + m.weeklyAttendance.attended,
    0,
  )

  // 데모 게스트 1건 — 진짜 필드 의미 (초대일, 캐릭터명) 그대로.
  const guests = [
    { ign: 'Wanderer', joinedDaysAgo: 3 },
  ]

  // 데모 탈퇴자 1건.
  const withdrawn = [
    { ign: 'OldKnight', withdrawnDaysAgo: 14 },
  ]

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={MEMBERS_TOUR_STEPS} namespace="members" />
      <div data-tour-id="members-header" className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-gray-400 text-sm">{t('description')}</p>
        </div>
        <p className="text-xs text-gray-400">
          {t.rich('counter', {
            memberCount: DEMO_MEMBERS.length,
            total: totalParticipation,
            bold: (chunks) => <span className="text-white font-semibold">{chunks}</span>,
          })}
        </p>
      </div>

      <div data-tour-id="members-tabs">
        <DemoMembersPageTabs
          membersCount={DEMO_MEMBERS.length}
          rosterCount={DEMO_MEMBERS.length}
          guestsCount={guests.length}
          withdrawnCount={withdrawn.length}
          membersSection={<DemoMembersTable members={DEMO_MEMBERS} />}
          rosterSection={<DemoRoster />}
          guestsSection={<DemoGuests guests={guests} />}
          withdrawnSection={<DemoWithdrawn withdrawn={withdrawn} />}
        />
      </div>

      <p className="text-[11px] text-gray-600 italic px-1">{tDemo('members.demoOnlyDetail')}</p>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('members.title')}
        description={tCta('members.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

// 모든 데모 멤버는 Discord 연동된 상태로 표시 (실제 앱에서 가장 흔한 상태).
async function DemoRoster() {
  const t = await getTranslations('members')
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-950 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left px-3 py-2">Albion</th>
              <th className="text-right px-3 py-2 pr-4">{t('rosterDiscordLinked')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {DEMO_MEMBERS.map((m) => (
              <tr key={m.ign} className="text-gray-200">
                <td className="px-3 py-2.5 font-semibold text-white">{m.ign}</td>
                <td className="px-3 py-2.5 pr-4 text-right">
                  <span className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {t('rosterDiscordLinked')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

async function DemoGuests({ guests }: { guests: { ign: string; joinedDaysAgo: number }[] }) {
  const t = await getTranslations('members')
  if (guests.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-8">{t('noGuests')}</p>
  }
  return (
    <ul className="space-y-2">
      {guests.map((g) => (
        <li
          key={g.ign}
          className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{g.ign}</span>
            <span className="inline-flex items-center gap-1 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {t('guestBadge')}
            </span>
          </div>
          <span className="text-xs text-gray-500 font-mono">+{g.joinedDaysAgo}d</span>
        </li>
      ))}
    </ul>
  )
}

async function DemoWithdrawn({
  withdrawn,
}: {
  withdrawn: { ign: string; withdrawnDaysAgo: number }[]
}) {
  const t = await getTranslations('members')
  if (withdrawn.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-8">{t('noWithdrawn')}</p>
  }
  return (
    <ul className="space-y-2">
      {withdrawn.map((w) => (
        <li
          key={w.ign}
          className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-300">{w.ign}</span>
            <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {t('withdrawnBadge')}
            </span>
          </div>
          <span className="text-xs text-gray-500 font-mono">-{w.withdrawnDaysAgo}d</span>
        </li>
      ))}
    </ul>
  )
}
