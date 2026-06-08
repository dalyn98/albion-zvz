import {
  Bot,
  Building2,
  Languages,
  Link2,
  LogIn,
  MousePointerClick,
  TrendingUp,
} from 'lucide-react'
import { loadSeoAcquisitionReport, type SeoReportGroupRow } from '@/lib/seo-acquisition-report'

export const dynamic = 'force-dynamic'

interface StatCardProps {
  label: string
  value: number | string
  hint?: string
  Icon: typeof TrendingUp
}

function StatCard({ label, value, hint, Icon }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
        <Icon size={14} />
        <span>{label}</span>
      </div>
      <div className="font-mono text-2xl font-bold text-white">
        {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
      </div>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
    </div>
  )
}

function percent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function GroupTable({
  title,
  Icon,
  rows,
}: {
  title: string
  Icon: typeof Languages
  rows: SeoReportGroupRow[]
}) {
  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-900 p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-300">
        <Icon size={14} />
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="py-2 pr-3 font-medium">구분</th>
              <th className="py-2 pr-3 font-medium">세션</th>
              <th className="py-2 pr-3 font-medium">CTA 세션</th>
              <th className="py-2 pr-3 font-medium">전환 tenant</th>
              <th className="py-2 pr-3 font-medium">전환율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="py-2 pr-3 font-mono text-gray-200">{row.key}</td>
                <td className="py-2 pr-3 text-gray-300">{row.sessions.toLocaleString('ko-KR')}</td>
                <td className="py-2 pr-3 text-gray-300">
                  {row.ctaClickSessions.toLocaleString('ko-KR')}
                </td>
                <td className="py-2 pr-3 text-gray-300">
                  {row.acquiredTenants.toLocaleString('ko-KR')}
                </td>
                <td className="py-2 pr-3 text-emerald-300">
                  {percent(row.acquiredTenants, row.sessions)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-gray-500" colSpan={5}>
                  아직 수집된 SEO 유입 데이터가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default async function SuperAdminSeoPage() {
  const report = await loadSeoAcquisitionReport(30)
  const installRate = percent(report.totals.botInstallStartSessions, report.totals.sessions)
  const acquisitionRate = percent(report.totals.acquiredTenants, report.totals.sessions)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">SEO 유입 리포트</h1>
        <p className="mt-1 text-sm text-gray-400">
          최근 30일 feature SEO 페이지의 유입부터 tenant 생성까지 추적합니다.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="SEO 세션" value={report.totals.sessions} Icon={TrendingUp} />
        <StatCard label="CTA 클릭 세션" value={report.totals.ctaClickSessions} Icon={MousePointerClick} />
        <StatCard label="Discord OAuth" value={report.totals.discordStartSessions} Icon={LogIn} />
        <StatCard label="봇 설치 시작" value={report.totals.botInstallStartSessions} Icon={Bot} hint={installRate} />
        <StatCard label="전환 tenant" value={report.totals.acquiredTenants} Icon={Building2} hint={acquisitionRate} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GroupTable title="언어별 성과" Icon={Languages} rows={report.byLocale} />
        <GroupTable title="기능 페이지별 성과" Icon={Link2} rows={report.byFeature} />
      </div>

      <section className="rounded-2xl border border-gray-700 bg-gray-900 p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-300">최근 전환 tenant</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-2 pr-3 font-medium">tenant</th>
                <th className="py-2 pr-3 font-medium">기능</th>
                <th className="py-2 pr-3 font-medium">언어</th>
                <th className="py-2 pr-3 font-medium">소스</th>
                <th className="py-2 pr-3 font-medium">상태</th>
                <th className="py-2 pr-3 font-medium">온보딩</th>
                <th className="py-2 pr-3 font-medium">전환 시각</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {report.recentAcquisitions.map((row) => (
                <tr key={row.tenantId}>
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-white">{row.tenantName ?? row.tenantId}</div>
                    <div className="font-mono text-xs text-gray-500">{row.tenantSlug ?? row.tenantId}</div>
                  </td>
                  <td className="py-2 pr-3 font-mono text-gray-300">
                    {row.featureSlug ?? 'features-index'}
                  </td>
                  <td className="py-2 pr-3 text-gray-300">{row.locale}</td>
                  <td className="py-2 pr-3 text-gray-300">{row.source}</td>
                  <td className="py-2 pr-3 text-gray-300">{row.tenantStatus ?? 'unknown'}</td>
                  <td className="py-2 pr-3 text-xs">
                    <span className={row.setupCompleted ? 'text-emerald-300' : 'text-amber-300'}>
                      {row.setupCompleted ? '설정 완료' : '설정 진행중'}
                    </span>
                    <span className="mx-1 text-gray-600">/</span>
                    <span className={row.firstEventCreated ? 'text-emerald-300' : 'text-gray-400'}>
                      {row.firstEventCreated ? '첫 이벤트 생성' : '첫 이벤트 전'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-gray-400">
                    {new Date(row.capturedAt).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
              {report.recentAcquisitions.length === 0 ? (
                <tr>
                  <td className="py-6 text-center text-gray-500" colSpan={7}>
                    아직 SEO 전환 tenant가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
