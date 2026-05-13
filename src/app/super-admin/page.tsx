import {
  Building2,
  Bot,
  CalendarDays,
  Swords,
  ShieldCheck,
  Coins,
  Heart,
  Users,
  CreditCard,
  RefreshCw,
} from 'lucide-react'
import { getSystemStats } from '@/lib/super-admin-stats'
import ManualSyncButton from './ManualSyncButton'

export const dynamic = 'force-dynamic'

interface StatCardProps {
  label: string
  value: number | string
  Icon: typeof Building2
  hint?: string
}

function StatCard({ label, value, Icon, hint }: StatCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
        <Icon size={14} />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold text-white font-mono">{value.toLocaleString('ko-KR')}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  active: '활성',
  pending: '대기',
  suspended: '정지',
  deleted: '아카이브',
}

const STATUS_COLOR: Record<string, string> = {
  active: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  pending: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  suspended: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
  deleted: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
}

export default async function SuperAdminDashboardPage() {
  const stats = await getSystemStats()
  const installRate = stats.tenantsTotal > 0
    ? Math.round((stats.botsInstalled / stats.tenantsTotal) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">시스템 대시보드</h1>
        <p className="text-gray-400 text-sm mt-1">
          모든 테넌트의 누적 상태입니다.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">테넌트</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="전체" value={stats.tenantsTotal} Icon={Building2} />
          <StatCard
            label="봇 설치"
            value={stats.botsInstalled}
            Icon={Bot}
            hint={`${installRate}%`}
          />
          {Object.entries(stats.tenantsByStatus).map(([status, count]) => (
            <div
              key={status}
              className={`border rounded-2xl p-4 sm:p-5 ${STATUS_COLOR[status] ?? 'bg-gray-900 border-gray-700 text-gray-300'}`}
            >
              <div className="text-xs mb-2 opacity-80">{STATUS_LABEL[status] ?? status}</div>
              <div className="text-2xl font-bold font-mono">{count.toLocaleString('ko-KR')}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">사용자 활동 (전체 테넌트 누적)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard label="가입 멤버" value={stats.members} Icon={Users} />
          <StatCard label="이벤트" value={stats.events} Icon={CalendarDays} />
          <StatCard label="추적 전투" value={stats.battles} Icon={Swords} />
          <StatCard label="리기어 신청" value={stats.regearRequests} Icon={ShieldCheck} />
          <StatCard label="환전 신청" value={stats.exchangeRequests} Icon={Coins} />
          <StatCard label="기부" value={stats.donationRequests} Icon={Heart} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <RefreshCw size={14} />
          수동 동기화
        </h2>
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
          <p className="text-xs text-gray-400">
            cron 은 5분 주기로 자동 실행됩니다. &quot;방금 전투했는데 지금 보고 싶다&quot;
            처럼 즉시성이 필요할 때만 강제 실행하세요. 모든 활성 테넌트의 전투/킬로그를
            한꺼번에 갱신하므로 최대 2분이 걸릴 수 있습니다.
          </p>
          <ManualSyncButton />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">빌링 / 사용량</h2>
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 flex items-start gap-3">
          <CreditCard size={20} className="text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-300">곧 출시</p>
            <p className="text-xs text-gray-500 mt-1">
              테넌트별 사용량 (멤버 수 / 이벤트 수 / 봇 호출량) 과 결제 상태를 여기에서
              확인하고 SaaS 플랜으로 연결합니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
