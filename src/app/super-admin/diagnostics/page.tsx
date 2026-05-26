import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  DatabaseZap,
  Eye,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

type Method = 'GET' | 'POST'
type Risk = 'read' | 'write' | 'cron'

interface DiagnosticEndpoint {
  title: string
  description: string
  method: Method
  href: string
  params: string
  risk: Risk
  note: string
}

const ENDPOINTS: DiagnosticEndpoint[] = [
  {
    title: '자동 리기어 최근 생성 목록',
    description: '최근 auto_generated 리기어 신청 분포와 행을 확인합니다.',
    method: 'GET',
    href: '/api/admin/auto-regear-list?since_hours=48',
    params: 'since_hours=1..720',
    risk: 'read',
    note: '현재 impersonation/세션의 길드 기준 read-only',
  },
  {
    title: '자동 리기어 이벤트 진단',
    description: '이벤트 1개의 자동 리기어 게이트를 단계별로 dry-run 확인합니다.',
    method: 'GET',
    href: '/api/admin/auto-regear-debug?event_id=',
    params: 'event_id=<uuid>',
    risk: 'read',
    note: 'event_id 없이는 400. 특정 이벤트 상세에서 ID를 붙여 호출',
  },
  {
    title: '통계 시간창 진단',
    description: 'tracked battle window, 이벤트 battle_started_at, killboard 행 매칭을 비교합니다.',
    method: 'GET',
    href: '/api/admin/stats-diagnose',
    params: '없음',
    risk: 'read',
    note: '승패/킬 통계 0건 원인 추적용 read-only',
  },
  {
    title: '자동 리기어 백필',
    description: '처리 완료 표시를 해제하고 자동 리기어 프로세서를 즉시 재실행합니다.',
    method: 'POST',
    href: '/api/admin/auto-regear-backfill',
    params: 'event_id=<uuid> 또는 since_hours=1..168',
    risk: 'write',
    note: '중복 제약은 있지만 처리 상태를 바꾸므로 원인 확인 후 실행',
  },
  {
    title: '킬보드 battle_id 백필',
    description: 'battle_id가 비어 있는 과거 killboard_events를 Albion API로 보정합니다.',
    method: 'POST',
    href: '/api/admin/killboard-backfill-battle-id',
    params: '없음',
    risk: 'write',
    note: '외부 API 호출량이 있고 기존 행을 업데이트함',
  },
  {
    title: '킬보드 장비 백필',
    description: 'killer 장비가 비어 있는 killboard_events를 Albion 이벤트 API로 보정합니다.',
    method: 'POST',
    href: '/api/admin/killboard-backfill-equipment',
    params: 'all=1 선택',
    risk: 'write',
    note: '기본은 tracked 범위. all=1은 전체 killer null equipment 대상',
  },
  {
    title: '전투 매치업 백필',
    description: 'CRON_SECRET Bearer로만 호출되는 전투 매치업 백필입니다.',
    method: 'GET',
    href: '/api/admin/battle-matchup-backfill',
    params: 'Authorization: Bearer CRON_SECRET, limit=1..1000, mode=legacy|stale, before=<ISO>',
    risk: 'cron',
    note: '브라우저 세션 호출 대상 아님. Vercel/서버 작업에서만 실행',
  },
]

const RISK_STYLE: Record<Risk, { label: string; className: string; Icon: LucideIcon }> = {
  read: {
    label: 'read-only',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    Icon: Eye,
  },
  write: {
    label: 'writes data',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    Icon: DatabaseZap,
  },
  cron: {
    label: 'secret-only',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    Icon: ShieldCheck,
  },
}

export default function SuperAdminDiagnosticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">진단/백필</h1>
        <p className="mt-1 text-sm text-gray-400">
          운영용 API를 목적, 파라미터, 위험도 기준으로 정리했습니다.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            POST 항목은 기존 데이터를 갱신하거나 처리 상태를 바꿉니다. 먼저 read-only 진단으로
            원인을 확인한 뒤, 대상 길드 impersonation 상태가 맞는지 확인하고 실행하세요.
          </p>
        </div>
      </div>

      <section className="grid gap-3 xl:grid-cols-2">
        {ENDPOINTS.map((endpoint) => (
          <DiagnosticCard key={`${endpoint.method}-${endpoint.href}`} endpoint={endpoint} />
        ))}
      </section>
    </div>
  )
}

function DiagnosticCard({ endpoint }: { endpoint: DiagnosticEndpoint }) {
  const risk = RISK_STYLE[endpoint.risk]
  const Icon = risk.Icon
  const canOpen = endpoint.method === 'GET' && endpoint.risk === 'read'

  return (
    <article className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-gray-800 px-2 py-1 font-mono text-xs text-gray-300">
              {endpoint.method}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${risk.className}`}>
              <Icon size={12} />
              {risk.label}
            </span>
          </div>
          <h2 className="mt-3 text-base font-semibold text-white">{endpoint.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-400">{endpoint.description}</p>
        </div>
        {canOpen && (
          <Link
            href={endpoint.href}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-md border border-gray-600 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-amber-400 hover:text-amber-200"
          >
            <Activity size={13} />
            열기
          </Link>
        )}
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-gray-500">Endpoint</dt>
          <dd className="mt-1 break-all font-mono text-gray-200">{endpoint.href}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Params</dt>
          <dd className="mt-1 text-gray-200">{endpoint.params}</dd>
        </div>
      </dl>

      <div className="mt-3 rounded-md bg-gray-800/70 px-3 py-2 text-xs text-gray-400">
        <RefreshCw size={12} className="mr-1 inline" />
        {endpoint.note}
      </div>
    </article>
  )
}
