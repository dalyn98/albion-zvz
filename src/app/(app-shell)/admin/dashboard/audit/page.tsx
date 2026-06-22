import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import AccessDeniedState from '@/components/AccessDeniedState'
import AuditLogTableBody from '@/components/AuditLogTableBody'
import { getSession, sessionHas } from '@/lib/session'
import { CAP } from '@/lib/permissions'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import {
  ADMIN_ACTIONS,
  ADMIN_AUDIT_TARGET_KINDS,
  listAdminAuditLog,
  type AdminAction,
  type AdminAuditLogRow,
  type AdminAuditTargetKind,
} from '@/lib/admin-audit'
import { getUsernamesByDiscordIds } from '@/lib/discord-avatar'
import { formatDateTimeWithSeconds } from '@/lib/format-datetime'
import {
  ADMIN_ACTION_LABEL_KEY,
  ADMIN_AUDIT_TARGET_KIND_LABEL_KEY,
} from '@/lib/admin-audit-i18n'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const COLLAPSED_ROW_COUNT = 12
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

interface SearchParams {
  action?: string
  admin?: string
  target_kind?: string
  target_user?: string
  from?: string
  to?: string
  page?: string
}

interface ResolvedFilters {
  action: AdminAction | undefined
  adminDiscordId: string | undefined
  targetKind: AdminAuditTargetKind | undefined
  targetDiscordId: string | undefined
  fromDate: string | undefined
  toDate: string | undefined
}

function resolveAction(v: string | undefined): AdminAction | undefined {
  if (!v) return undefined
  return (ADMIN_ACTIONS as readonly string[]).includes(v) ? (v as AdminAction) : undefined
}

function resolveTargetKind(v: string | undefined): AdminAuditTargetKind | undefined {
  if (!v) return undefined
  return (ADMIN_AUDIT_TARGET_KINDS as readonly string[]).includes(v)
    ? (v as AdminAuditTargetKind)
    : undefined
}

function resolveDiscordId(v: string | undefined): string | undefined {
  const trimmed = v?.trim()
  if (!trimmed) return undefined
  return /^\d{10,32}$/.test(trimmed) ? trimmed : undefined
}

function resolveDate(v: string | undefined): string | undefined {
  if (!v) return undefined
  return DATE_PATTERN.test(v) ? v : undefined
}

function resolvePage(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams

  const filters: ResolvedFilters = {
    action: resolveAction(sp.action),
    adminDiscordId: resolveDiscordId(sp.admin),
    targetKind: resolveTargetKind(sp.target_kind),
    targetDiscordId: resolveDiscordId(sp.target_user),
    fromDate: resolveDate(sp.from),
    toDate: resolveDate(sp.to),
  }
  const page = resolvePage(sp.page)
  const offset = (page - 1) * PAGE_SIZE

  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if (!sessionHas(session, CAP.AUDIT_VIEW)) return <AccessDeniedState />
  const guildId = await getSessionGuildId(session)

  const [tAudit, tNav, tz] = await Promise.all([
    getTranslations('adminAudit'),
    getTranslations('nav'),
    getTenantTimezone(guildId),
  ])

  const { rows, total } = await listAdminAuditLog(guildId, {
    filters: {
      action: filters.action,
      adminDiscordId: filters.adminDiscordId,
      targetKind: filters.targetKind,
      targetDiscordId: filters.targetDiscordId,
      from: filters.fromDate ? `${filters.fromDate}T00:00:00Z` : undefined,
      to: filters.toDate ? `${filters.toDate}T23:59:59Z` : undefined,
    },
    limit: PAGE_SIZE,
    offset,
  })

  const discordIds = Array.from(
    new Set(
      rows.flatMap((r): readonly string[] => {
        const ids: string[] = [r.adminDiscordId]
        if (r.targetDiscordId) ids.push(r.targetDiscordId)
        return ids
      }),
    ),
  )
  const usernameMap = await getUsernamesByDiscordIds(guildId, discordIds)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('audit')}</h1>
      </div>
      <p className="text-sm text-gray-400">{tAudit('description')}</p>

      <FilterForm filters={filters} tAudit={tAudit} />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{tAudit('totalCount', { count: total.toLocaleString() })}</span>
        <span>{tAudit('pageOf', { page, totalPages })}</span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-gray-900/60 border border-gray-700 rounded-lg px-4 py-8 text-center text-sm text-gray-500">
          {tAudit('empty')}
        </div>
      ) : (
        <AuditTable rows={rows} usernameMap={usernameMap} tz={tz} tAudit={tAudit} />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        filters={filters}
        labels={{ prev: tAudit('prev'), next: tAudit('next') }}
      />
    </div>
  )
}

type Translator = Awaited<ReturnType<typeof getTranslations>>

function actionLabel(tAudit: Translator, action: string): string {
  const key = (ADMIN_ACTION_LABEL_KEY as Record<string, string>)[action]
  return key ? tAudit(key as Parameters<typeof tAudit>[0]) : tAudit('unknownAction')
}

function targetKindLabel(tAudit: Translator, kind: string): string {
  const key = (ADMIN_AUDIT_TARGET_KIND_LABEL_KEY as Record<string, string>)[kind]
  return key ? tAudit(key as Parameters<typeof tAudit>[0]) : tAudit('unknownTargetKind')
}

function collapseLabels(tAudit: Translator, total: number, initialCount: number) {
  const totalLabel = total.toLocaleString()
  return {
    collapse: tAudit('collapseRows'),
    collapsedSummary: tAudit('rowsVisibleSummary', {
      visible: Math.min(initialCount, total).toLocaleString(),
      total: totalLabel,
    }),
    expandedSummary: tAudit('rowsVisibleSummary', {
      visible: totalLabel,
      total: totalLabel,
    }),
    showAll: tAudit('showAllRows', {
      count: Math.max(0, total - initialCount).toLocaleString(),
    }),
  }
}

function FilterForm({
  filters,
  tAudit,
}: {
  filters: ResolvedFilters
  tAudit: Translator
}) {
  return (
    <form
      method="GET"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-gray-900/60 border border-gray-700 rounded-lg p-3"
    >
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        <span>{tAudit('filterAction')}</span>
        <select
          name="action"
          defaultValue={filters.action ?? ''}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        >
          <option value="">{tAudit('filterAny')}</option>
          {ADMIN_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {actionLabel(tAudit, a)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        <span>{tAudit('filterTargetKind')}</span>
        <select
          name="target_kind"
          defaultValue={filters.targetKind ?? ''}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        >
          <option value="">{tAudit('filterAny')}</option>
          {ADMIN_AUDIT_TARGET_KINDS.map((k) => (
            <option key={k} value={k}>
              {targetKindLabel(tAudit, k)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        <span>{tAudit('filterAdmin')}</span>
        <input
          type="text"
          name="admin"
          defaultValue={filters.adminDiscordId ?? ''}
          inputMode="numeric"
          pattern="\d{10,32}"
          placeholder={tAudit('filterDiscordIdPlaceholder')}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white font-mono"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        <span>{tAudit('filterTargetUser')}</span>
        <input
          type="text"
          name="target_user"
          defaultValue={filters.targetDiscordId ?? ''}
          inputMode="numeric"
          pattern="\d{10,32}"
          placeholder={tAudit('filterDiscordIdPlaceholder')}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white font-mono"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        <span>{tAudit('filterFrom')}</span>
        <input
          type="date"
          name="from"
          defaultValue={filters.fromDate ?? ''}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        <span>{tAudit('filterTo')}</span>
        <input
          type="date"
          name="to"
          defaultValue={filters.toDate ?? ''}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
        />
      </label>
      <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-2">
        <Link
          href="/admin/dashboard/audit"
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded border border-gray-700 hover:border-gray-500"
        >
          {tAudit('filterReset')}
        </Link>
        <button
          type="submit"
          className="text-xs font-semibold text-gray-900 bg-amber-400 hover:bg-amber-300 px-3 py-1.5 rounded"
        >
          {tAudit('filterApply')}
        </button>
      </div>
    </form>
  )
}

function AuditTable({
  rows,
  usernameMap,
  tz,
  tAudit,
}: {
  rows: readonly AdminAuditLogRow[]
  usernameMap: Map<string, string | null>
  tz: string
  tAudit: Translator
}) {
  return (
    <div className="overflow-x-auto bg-gray-900/60 border border-gray-700 rounded-lg">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-800/60 text-xs uppercase tracking-wider text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left whitespace-nowrap">{tAudit('colTime')}</th>
            <th className="px-3 py-2 text-left">{tAudit('colAdmin')}</th>
            <th className="px-3 py-2 text-left">{tAudit('colAction')}</th>
            <th className="px-3 py-2 text-left">{tAudit('colTarget')}</th>
            <th className="px-3 py-2 text-left">{tAudit('colDetails')}</th>
          </tr>
        </thead>
        <AuditLogTableBody
          className="divide-y divide-gray-800"
          colSpan={5}
          initialCount={COLLAPSED_ROW_COUNT}
          labels={collapseLabels(tAudit, rows.length, COLLAPSED_ROW_COUNT)}
        >
          {rows.map((row) => {
            const adminLabel = usernameMap.get(row.adminDiscordId) ?? row.adminDiscordId
            const targetUserLabel = row.targetDiscordId
              ? (usernameMap.get(row.targetDiscordId) ?? row.targetDiscordId)
              : null
            const targetIdLabel = row.targetId ?? null
            const detailsLabel =
              Object.keys(row.details).length > 0 ? JSON.stringify(row.details) : '—'
            return (
              <tr key={row.id} className="hover:bg-gray-800/40 align-top">
                <td className="px-3 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">
                  {formatDateTimeWithSeconds(row.createdAt, tz)}
                </td>
                <td className="px-3 py-2 text-xs text-gray-200">
                  <div className="font-medium text-gray-100 truncate max-w-[160px]">
                    {adminLabel}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono truncate">
                    {row.adminDiscordId}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className="inline-block text-amber-300 font-semibold">
                    {actionLabel(tAudit, row.action)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-300">
                  {row.targetKind && (
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wide">
                      {targetKindLabel(tAudit, row.targetKind)}
                    </span>
                  )}
                  {targetUserLabel && (
                    <span className="block text-gray-200 truncate max-w-[180px]">
                      {targetUserLabel}
                    </span>
                  )}
                  {targetIdLabel && (
                    <span className="block text-[10px] text-gray-500 font-mono truncate max-w-[180px]">
                      {targetIdLabel}
                    </span>
                  )}
                  {!targetUserLabel && !targetIdLabel && (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[11px] text-gray-400 font-mono">
                  <details className="max-w-md">
                    <summary className="cursor-pointer hover:text-gray-200 truncate">
                      {detailsLabel}
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-gray-500">
                      {JSON.stringify(row.details, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            )
          })}
        </AuditLogTableBody>
      </table>
    </div>
  )
}

function buildHref(page: number, filters: ResolvedFilters): string {
  const params = new URLSearchParams()
  if (filters.action) params.set('action', filters.action)
  if (filters.targetKind) params.set('target_kind', filters.targetKind)
  if (filters.adminDiscordId) params.set('admin', filters.adminDiscordId)
  if (filters.targetDiscordId) params.set('target_user', filters.targetDiscordId)
  if (filters.fromDate) params.set('from', filters.fromDate)
  if (filters.toDate) params.set('to', filters.toDate)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/admin/dashboard/audit?${qs}` : '/admin/dashboard/audit'
}

function Pagination({
  page,
  totalPages,
  filters,
  labels,
}: {
  page: number
  totalPages: number
  filters: ResolvedFilters
  labels: { prev: string; next: string }
}) {
  if (totalPages <= 1) return null
  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages
  const baseClass = 'px-3 py-1.5 rounded border text-xs'
  const activeClass =
    'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500'
  const disabledClass = 'border-gray-800 text-gray-700'
  return (
    <nav className="flex items-center justify-end gap-2">
      {prevDisabled ? (
        <span aria-disabled="true" className={`${baseClass} ${disabledClass}`}>
          {labels.prev}
        </span>
      ) : (
        <Link href={buildHref(page - 1, filters)} className={`${baseClass} ${activeClass}`}>
          {labels.prev}
        </Link>
      )}
      {nextDisabled ? (
        <span aria-disabled="true" className={`${baseClass} ${disabledClass}`}>
          {labels.next}
        </span>
      ) : (
        <Link href={buildHref(page + 1, filters)} className={`${baseClass} ${activeClass}`}>
          {labels.next}
        </Link>
      )}
    </nav>
  )
}
