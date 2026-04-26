import Link from 'next/link'
import { ArrowRight, Bot, Users, CalendarDays } from 'lucide-react'
import { listAllTenantsWithStats } from '@/lib/super-admin-stats'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { getSuperAdminPath } from '@/lib/super-admin-path'

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

interface SearchParams {
  status?: string
  q?: string
}

const ALL_FILTER = 'all'

export default async function SuperAdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const statusFilter = sp.status ?? ALL_FILTER
  const query = (sp.q ?? '').trim().toLowerCase()
  const tenants = await listAllTenantsWithStats()
  const basePath = getSuperAdminPath()

  const filtered = tenants.filter((t) => {
    if (statusFilter !== ALL_FILTER && t.status !== statusFilter) return false
    if (query.length === 0) return true
    return (
      t.name.toLowerCase().includes(query) ||
      t.slug.toLowerCase().includes(query) ||
      t.discordGuildId.includes(query)
    )
  })

  const filters = [
    { key: ALL_FILTER, label: '전체', count: tenants.length },
    { key: 'active', label: STATUS_LABEL.active, count: tenants.filter((t) => t.status === 'active').length },
    { key: 'pending', label: STATUS_LABEL.pending, count: tenants.filter((t) => t.status === 'pending').length },
    { key: 'suspended', label: STATUS_LABEL.suspended, count: tenants.filter((t) => t.status === 'suspended').length },
    { key: 'deleted', label: STATUS_LABEL.deleted, count: tenants.filter((t) => t.status === 'deleted').length },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">테넌트 목록</h1>
        <p className="text-gray-400 text-sm mt-1">전체 {tenants.length}개</p>
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={`${basePath}/tenants?status=${f.key}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-xs border ${
              statusFilter === f.key
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600'
            }`}
          >
            {f.label} <span className="font-mono opacity-70">({f.count})</span>
          </Link>
        ))}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="이름/슬러그/길드 ID"
          className="ml-auto bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 w-56"
        />
        {statusFilter !== ALL_FILTER && <input type="hidden" name="status" value={statusFilter} />}
      </form>

      {filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center text-gray-400 text-sm">
          조건에 맞는 테넌트가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="bg-gray-900 border border-gray-700 rounded-2xl p-4 hover:border-gray-600 transition-colors"
            >
              <Link href={`${basePath}/tenants/${t.id}`} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-base font-bold text-white truncate">{t.name}</span>
                    <span className="text-xs text-gray-500 font-mono truncate">{t.slug}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLOR[t.status] ?? 'bg-gray-500/10 border-gray-500/30 text-gray-300'}`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <Bot size={12} className={t.botInstalled ? 'text-emerald-400' : 'text-gray-600'} />
                      {t.botInstalled
                        ? `설치 ${t.botInstalledAt ? formatDateTimeShort(t.botInstalledAt) : ''}`
                        : '미설치'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} className="text-gray-500" />
                      <span className="font-mono">{t.memberCount.toLocaleString('ko-KR')}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={12} className="text-gray-500" />
                      <span className="font-mono">{t.eventCount.toLocaleString('ko-KR')}</span>
                    </span>
                    <span className="text-gray-600 font-mono">guild_id: {t.discordGuildId}</span>
                  </div>
                </div>
                <ArrowRight size={16} className="text-gray-500 flex-shrink-0 mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
