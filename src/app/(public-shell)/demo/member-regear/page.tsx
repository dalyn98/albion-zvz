import Link from 'next/link'
import { ChevronRight, FilePlus2, ShieldCheck, WalletCards } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_REGEAR_LIST, type DemoRegearListItem } from '@/data/demo-seed'
import MyRegearList from '@/components/MyRegearList'
import RegearPageTabs from '@/components/RegearPageTabs'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import type { MyRegearRequest } from '@/app/actions/regear'

const CURRENT_USER = 'Eternia'
const MEMBER_REGEAR_TOUR_STEPS = [
  { id: 'member-regear-entry' },
  { id: 'member-regear-requests' },
  { id: 'member-regear-wallet' },
] as const
const DAY_MS = 24 * 60 * 60 * 1000

function getDemoNowMs(): number {
  return Date.now()
}

function daysAgoIso(days: number, nowMs: number): string {
  return new Date(nowMs - days * DAY_MS).toISOString()
}

function toMyRegearRequest(
  request: DemoRegearListItem,
  index: number,
  nowMs: number,
): MyRegearRequest {
  return {
    id: request.id,
    event_id: `event-${request.id}`,
    event_title: request.battleLabel,
    role_name: request.victim === 'Eternia' ? 'DefTanker' : 'EngageDps',
    base_silver: request.capSilver ?? request.totalSilver,
    silver: request.capSilver ?? request.totalSilver,
    regear_role_group: null,
    regear_role_policy_enabled: false,
    regear_role_policy_match_status: 'disabled',
    regear_role_policy_discord_role_name: null,
    request_type: request.requestType ?? 'death',
    claimed_silver: request.totalSilver,
    payout_silver: request.status === 'approved' ? request.totalSilver : null,
    video_proof_url: null,
    video_proof_title: null,
    status: request.status,
    killboard_verified: request.origin === 'auto',
    admin_notes: null,
    reject_reason_code: null,
    created_at: daysAgoIso(index + 1, nowMs),
    resolved_at: request.status === 'pending' ? null : daysAgoIso(index, nowMs),
    handled_by_username: request.handledBy ?? null,
    build_snapshot: null,
    auto_generated: request.origin === 'auto',
    requester_relation: 'home_guild',
  }
}

export default async function DemoMemberRegearPage() {
  const [t, tRegear, tCta] = await Promise.all([
    getTranslations('demo.memberRegear'),
    getTranslations('regear'),
    getTranslations('demo.ctaCard'),
  ])
  const nowMs = getDemoNowMs()
  const myRequests = DEMO_REGEAR_LIST
    .filter((request) => request.victim === CURRENT_USER)
    .map((request, index) => toMyRegearRequest(request, index, nowMs))

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={MEMBER_REGEAR_TOUR_STEPS} namespace="memberRegear" />
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck size={20} className="text-amber-400" />
          {t('title')}
        </h1>
        <p className="text-gray-400 text-sm mt-1">{t('subtitle')}</p>
      </div>

      <div data-tour-id="member-regear-requests">
        <RegearPageTabs
          eligibleLabel={tRegear('tabEligible')}
          historyLabel={tRegear('tabHistory')}
          eligibleCount={2}
          historyCount={myRequests.length}
          eligibleSection={
            <section data-tour-id="member-regear-entry" className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <ShieldCheck size={20} className="text-emerald-300" />
                <h2 className="mt-3 text-sm font-bold text-white">{t('autoTitle')}</h2>
                <p className="mt-1 text-xs leading-relaxed text-emerald-100/80">{t('autoDescription')}</p>
                <Link
                  href="/demo/regear/rg-1"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-200 hover:text-emerald-100"
                >
                  {t('viewAutoClaim')}
                  <ChevronRight size={13} />
                </Link>
              </div>
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                <FilePlus2 size={20} className="text-amber-300" />
                <h2 className="mt-3 text-sm font-bold text-white">{t('manualTitle')}</h2>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">{t('manualDescription')}</p>
                <DemoActionButton className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400">
                  <FilePlus2 size={13} />
                  {t('manualButton')}
                </DemoActionButton>
              </div>
            </section>
          }
          historySection={
            <MyRegearList
              requests={myRequests}
              detailHrefPrefix="/demo/regear"
              interactionMode="demo"
            />
          }
        />
      </div>

      <section data-tour-id="member-regear-wallet" className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 flex items-center gap-3">
        <WalletCards size={18} className="text-amber-300 shrink-0" />
        <p className="text-xs text-gray-400 leading-relaxed">{t('walletHint')}</p>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('regear.title')}
        description={tCta('regear.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
