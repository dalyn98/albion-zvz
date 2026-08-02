import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { listAuditLog } from '@/lib/super-admin-audit'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { getSuperAdminPath } from '@/lib/super-admin-path'

export const dynamic = 'force-dynamic'

const ACTION_LABEL: Record<string, string> = {
  'tenant.status.update': '테넌트 상태 변경',
  'tenant.admin.grant': '관리자 권한 부여',
  'tenant.admin.revoke': '관리자 권한 회수',
  'notice.create': '시스템 공지 발행',
  'notice.replace': '시스템 공지 교체 발행',
  'notice.archive': '시스템 공지 종료',
  'impersonate.start': '임퍼소네이션 시작',
  'impersonate.end': '임퍼소네이션 종료',
  'sync.manual': '수동 동기화 실행',
  'user.nickname.update': '사용자 닉네임 변경',
  'guild.home-ownership.review': '길드 대표권 검토 시작',
  'guild.home-ownership.resolve': '길드 대표권 판정',
}

const ACTION_COLOR: Record<string, string> = {
  'tenant.status.update': 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  'tenant.admin.grant': 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  'tenant.admin.revoke': 'bg-rose-500/10 border-rose-500/30 text-rose-300',
  'notice.create': 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  'notice.replace': 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  'notice.archive': 'bg-gray-500/10 border-gray-500/30 text-gray-300',
  'impersonate.start': 'bg-rose-500/10 border-rose-500/30 text-rose-300',
  'impersonate.end': 'bg-gray-500/10 border-gray-500/30 text-gray-300',
  'sync.manual': 'bg-sky-500/10 border-sky-500/30 text-sky-300',
  'user.nickname.update': 'bg-violet-500/10 border-violet-500/30 text-violet-300',
  'guild.home-ownership.review': 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  'guild.home-ownership.resolve': 'bg-rose-500/10 border-rose-500/30 text-rose-300',
}

export default async function SuperAdminAuditPage() {
  const entries = await listAuditLog(100)
  const basePath = getSuperAdminPath()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">감사 로그</h1>
        <p className="text-gray-400 text-sm mt-1">
          슈퍼어드민이 수행한 모든 mutation 의 자동 기록 (최근 100개)입니다.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
          <ScrollText size={28} className="text-gray-600 mx-auto" />
          <p className="text-gray-400 text-sm">아직 기록된 활동이 없습니다.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="bg-gray-900 border border-gray-700 rounded-2xl p-3 space-y-1"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${ACTION_COLOR[e.action] ?? 'bg-gray-500/10 border-gray-500/30 text-gray-300'}`}
                >
                  {ACTION_LABEL[e.action] ?? e.action}
                </span>
                <span className="text-xs text-gray-500">{formatDateTimeShort(e.createdAt)}</span>
                <span className="text-xs text-gray-500 font-mono">
                  by {e.superAdminDiscordId}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-300">
                {e.targetTenantId && (
                  <span>
                    테넌트:{' '}
                    <Link
                      href={`${basePath}/tenants/${e.targetTenantId}`}
                      className="font-mono text-amber-400 hover:text-amber-300"
                    >
                      {e.targetTenantId}
                    </Link>
                  </span>
                )}
                {e.targetDiscordId && (
                  <span>
                    대상 사용자: <span className="font-mono">{e.targetDiscordId}</span>
                  </span>
                )}
              </div>
              {Object.keys(e.details).length > 0 && (
                <pre className="text-xs text-gray-400 bg-gray-950 border border-gray-800 rounded-md p-2 overflow-x-auto">
                  {JSON.stringify(e.details, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
