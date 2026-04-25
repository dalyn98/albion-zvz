import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Bot, ExternalLink, Trash2, UserPlus, Eye } from 'lucide-react'
import { getTenantDetail } from '@/lib/super-admin-stats'
import { formatDateTimeShort } from '@/lib/format-datetime'
import {
  setTenantStatus,
  grantTenantAdmin,
  revokeTenantAdmin,
  startImpersonation,
} from '@/app/super-admin/actions'

export const dynamic = 'force-dynamic'

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

const STATUS_DESCRIPTIONS: Record<string, string> = {
  active: '정상 — 모든 사용자 접근 가능',
  pending: '온보딩 미완료 — subdomain 비활성',
  suspended: '정지 — subdomain 비활성, 데이터 유지',
  deleted: '아카이브 — subdomain 비활성, tombstone',
}

interface PageProps {
  params: Promise<{ id: string }>
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-gray-400">{label}</span>
      <span className="font-mono text-white">{value.toLocaleString('ko-KR')}</span>
    </div>
  )
}

export default async function SuperAdminTenantDetailPage({ params }: PageProps) {
  const { id } = await params
  const tenant = await getTenantDetail(id)
  if (!tenant) notFound()

  const subdomainBaseUrl = process.env.NEXT_PUBLIC_TENANT_BASE_URL ?? ''
  const tenantUrl = subdomainBaseUrl
    ? `https://${tenant.slug}.${subdomainBaseUrl}`
    : null

  const statusOptions = (['active', 'pending', 'suspended', 'deleted'] as const).filter(
    (s) => s !== tenant.status,
  )

  return (
    <div className="space-y-5">
      <Link
        href="/super-admin/tenants"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
      >
        <ArrowLeft size={14} />
        목록으로
      </Link>

      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[tenant.status] ?? 'bg-gray-500/10 border-gray-500/30 text-gray-300'}`}
          >
            {STATUS_LABEL[tenant.status] ?? tenant.status}
          </span>
          <span className="text-sm text-gray-500 font-mono">{tenant.slug}</span>
        </div>
        <p className="text-xs text-gray-500 font-mono">tenant_id: {tenant.id}</p>
        {tenantUrl && (
          <a
            href={tenantUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 mt-1"
          >
            <ExternalLink size={12} />
            {tenantUrl}
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-1">
          <h2 className="text-sm font-semibold text-gray-300 mb-2">기본 정보</h2>
          <div className="text-sm space-y-1.5">
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">Discord 길드 ID</span>
              <span className="font-mono text-white text-xs">{tenant.discordGuildId}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">오너 Discord ID</span>
              <span className="font-mono text-white text-xs">{tenant.ownerDiscordId ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">생성일</span>
              <span className="text-white text-xs">{formatDateTimeShort(tenant.createdAt)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400 inline-flex items-center gap-1">
                <Bot size={12} />봇 설치
              </span>
              <span className="text-white text-xs">
                {tenant.botInstalled
                  ? formatDateTimeShort(tenant.botInstalledAt!)
                  : '미설치'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">이벤트 채널</span>
              <span className="font-mono text-white text-xs">
                {tenant.eventChannelId ?? '—'}
              </span>
            </div>
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-2">활동 통계</h2>
          <StatRow label="가입 멤버" value={tenant.memberCount} />
          <StatRow label="이벤트" value={tenant.eventCount} />
          <StatRow label="추적 전투" value={tenant.battleCount} />
          <StatRow label="리기어 신청" value={tenant.regearCount} />
          <StatRow label="환전 신청" value={tenant.exchangeCount} />
          <StatRow label="기부" value={tenant.donationCount} />
        </section>
      </div>

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-2">권한 역할 ID</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500 mb-1">멤버 역할</div>
            {tenant.memberRoleIds.length === 0 ? (
              <span className="text-gray-600 text-xs">없음</span>
            ) : (
              <ul className="space-y-1">
                {tenant.memberRoleIds.map((rid) => (
                  <li key={rid} className="font-mono text-xs text-gray-300">{rid}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">관리자 역할</div>
            {tenant.adminRoleIds.length === 0 ? (
              <span className="text-gray-600 text-xs">없음</span>
            ) : (
              <ul className="space-y-1">
                {tenant.adminRoleIds.map((rid) => (
                  <li key={rid} className="font-mono text-xs text-gray-300">{rid}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-2">최근 이벤트</h2>
        {tenant.recentEvents.length === 0 ? (
          <p className="text-gray-500 text-xs">없음</p>
        ) : (
          <ul className="space-y-1.5">
            {tenant.recentEvents.map((e) => (
              <li key={e.id} className="text-sm text-gray-300 flex items-center justify-between gap-3">
                <span className="truncate">{e.title}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">
                  {formatDateTimeShort(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── 임퍼소네이션 ─── */}
      <section className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-rose-300 inline-flex items-center gap-1">
              <Eye size={14} />
              이 길드 어드민으로 보기
            </h2>
            <p className="text-xs text-rose-200/70 mt-1">
              해당 테넌트의 어드민 시점으로 전체 사이트를 확인합니다. 종료 전까지 모든 페이지가 이
              테넌트 컨텍스트로 표시되며, 상단에 빨간 배너가 유지됩니다 (1시간 후 자동 만료).
            </p>
          </div>
          <form action={startImpersonation}>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 hover:bg-rose-500/30 text-xs font-semibold px-3 py-1.5 rounded-lg"
            >
              <Eye size={12} />
              시작
            </button>
          </form>
        </div>
      </section>

      {/* ─── 상태 변경 ─── */}
      <section className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-amber-300">상태 변경</h2>
          <p className="text-xs text-amber-200/70 mt-1">
            현재 상태: <strong>{STATUS_LABEL[tenant.status] ?? tenant.status}</strong>
            <span className="text-amber-200/50"> — {STATUS_DESCRIPTIONS[tenant.status]}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((s) => (
            <form key={s} action={setTenantStatus}>
              <input type="hidden" name="tenantId" value={tenant.id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                className={`text-xs px-3 py-1.5 rounded-lg border ${STATUS_COLOR[s] ?? ''} hover:opacity-80`}
                title={STATUS_DESCRIPTIONS[s]}
              >
                → {STATUS_LABEL[s]}
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* ─── 어드민 권한 오버라이드 ─── */}
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-300">어드민 권한 오버라이드</h2>
          <p className="text-xs text-gray-500 mt-1">
            길드 역할 없이도 admin 권한을 강제 부여합니다. 변경은 다음 로그인부터 적용됩니다.
          </p>
        </div>

        <form action={grantTenantAdmin} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-gray-500 block mb-1">Discord ID</label>
            <input
              type="text"
              name="discordId"
              required
              pattern="\d{15,25}"
              placeholder="예: 123456789012345678"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-gray-500 block mb-1">사유 (선택)</label>
            <input
              type="text"
              name="reason"
              placeholder="예: 운영 지원"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            <UserPlus size={12} />
            부여
          </button>
        </form>

        {tenant.adminOverrides.length === 0 ? (
          <p className="text-xs text-gray-600">현재 오버라이드 없음.</p>
        ) : (
          <ul className="space-y-1.5">
            {tenant.adminOverrides.map((ov) => (
              <li
                key={ov.discordId}
                className="flex items-center justify-between gap-3 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-white truncate">{ov.discordId}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {formatDateTimeShort(ov.grantedAt)} · 부여:{' '}
                    <span className="font-mono">{ov.grantedByDiscordId}</span>
                    {ov.reason && <> · {ov.reason}</>}
                  </div>
                </div>
                <form action={revokeTenantAdmin}>
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <input type="hidden" name="discordId" value={ov.discordId} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200 text-xs"
                  >
                    <Trash2 size={12} />
                    회수
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
