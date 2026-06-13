import Link from 'next/link'
import { AlertTriangle, Save, Search, UserRound } from 'lucide-react'
import { updateSiteNicknameOverride } from '@/app/super-admin/actions'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { getSuperAdminPath } from '@/lib/super-admin-path'
import {
  normalizeDiscordId,
  SITE_NICKNAME_MAX_LENGTH,
  SITE_NICKNAME_REASON_MAX_LENGTH,
} from '@/lib/site-nickname'
import {
  lookupSiteUserByDiscordId,
  searchSuperAdminAccounts,
  type SiteUserLookup,
  type SuperAdminAccountSearchRow,
  type SuperAdminAccountSearchSource,
} from '@/lib/super-admin-users'

export const dynamic = 'force-dynamic'

interface SearchParams {
  discordId?: string
  q?: string
}

function tenantLabel(lookup: SiteUserLookup, guildId: string): string {
  const tenant = lookup.tenants.get(guildId)
  if (!tenant) return guildId
  return `${tenant.name} (${tenant.slug})`
}

function accountTenantLabel(row: SuperAdminAccountSearchRow): string {
  if (!row.tenantId) return '전역 계정'
  if (!row.tenantName) return row.tenantId
  const status = row.tenantStatus ? ` · ${row.tenantStatus}` : ''
  return `${row.tenantName} (${row.tenantSlug})${status}`
}

function sourceLabel(source: SuperAdminAccountSearchSource): string {
  const labels: Record<SuperAdminAccountSearchSource, string> = {
    member: '멤버 row',
    identity_link: 'Albion 테넌트 링크',
    account_profile: 'Albion 계정 프로필',
    albion_roster: 'Albion 로스터',
  }
  return labels[source]
}

function statusLabel(row: SuperAdminAccountSearchRow): string {
  if (row.withdrawnAt) return '탈퇴 기록'
  if (row.revokedAt) return 'revoked'
  if (row.leftAt) return 'Albion 길드 이탈'
  if (row.trustStatus) return row.trustStatus
  return row.discordId ? '활성/기록 있음' : 'Discord 미연동'
}

function accountMergeHref(basePath: string, row: SuperAdminAccountSearchRow, side: 'from' | 'to'): string | null {
  if (!row.tenantId || !row.discordId) return null
  const params = new URLSearchParams({ tenantId: row.tenantId })
  if (side === 'from') params.set('fromDiscordId', row.discordId)
  else params.set('toDiscordId', row.discordId)
  return `${basePath}/account-merge?${params.toString()}`
}

export default async function SuperAdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const rawDiscordId = (sp.discordId ?? '').trim()
  const rawQuery = (sp.q ?? '').trim()
  const discordId = rawDiscordId ? normalizeDiscordId(rawDiscordId) : null
  const searchError = rawDiscordId && !discordId ? '숫자 Discord ID를 입력하세요.' : null
  const lookup = discordId ? await lookupSiteUserByDiscordId(discordId) : null
  const accountSearch = rawQuery ? await searchSuperAdminAccounts(rawQuery) : null
  const basePath = getSuperAdminPath()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">사용자 검색</h1>
        <p className="text-gray-400 text-sm mt-1">
          Discord ID, 사이트 닉네임, Albion 캐릭터명으로 운영 계정 기록을 찾습니다.
        </p>
      </div>

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">탈퇴자/계정 검색</h2>
          <p className="text-xs text-gray-500 mt-1">
            멤버 row, Albion 연동, 계정 프로필, 로스터를 함께 검색합니다.
          </p>
        </div>
        <form method="get" action={`${basePath}/users`} className="flex flex-col sm:flex-row gap-2">
          <input
            type="search"
            name="q"
            defaultValue={rawQuery}
            placeholder="닉네임 / Albion / Discord ID"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-100 text-sm font-semibold px-4 py-2 rounded-lg"
          >
            <Search size={14} />
            검색
          </button>
        </form>
      </section>

      {accountSearch && (
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-200">
            계정 검색 결과
            {accountSearch.ok ? ` (${accountSearch.results.length})` : ''}
          </h2>
          {!accountSearch.ok ? (
            <p className="text-sm text-rose-300">{accountSearch.error}</p>
          ) : accountSearch.results.length === 0 ? (
            <p className="text-sm text-gray-500">일치하는 계정 기록이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {accountSearch.results.map((row, index) => {
                const fromHref = accountMergeHref(basePath, row, 'from')
                const toHref = accountMergeHref(basePath, row, 'to')
                return (
                  <li
                    key={`${row.source}:${row.tenantId ?? 'global'}:${row.discordId ?? row.albionPlayerId ?? index}`}
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-gray-800 border-gray-700 text-gray-300">
                            {sourceLabel(row.source)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-200">
                            {statusLabel(row)}
                          </span>
                          <span className="text-xs text-gray-500">{accountTenantLabel(row)}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <div>
                            <span className="text-gray-500">Discord ID </span>
                            <span className="font-mono text-white">{row.discordId ?? '없음'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">사이트 닉네임 </span>
                            <span className="text-white">{row.username ?? row.publicDiscordHandle ?? '없음'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Albion </span>
                            <span className="text-white">
                              {row.albionPlayerName ?? '없음'}
                              {row.albionServer ? <span className="text-gray-500"> · {row.albionServer}</span> : null}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Player ID </span>
                            <span className="font-mono text-white">{row.albionPlayerId ?? '없음'}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          {row.relation && <span>relation: {row.relation}</span>}
                          {row.trustStatus && <span>trust: {row.trustStatus}</span>}
                          {row.withdrawnAt && <span>withdrawn: {formatDateTimeShort(row.withdrawnAt)}</span>}
                          {row.revokedAt && <span>revoked: {formatDateTimeShort(row.revokedAt)}</span>}
                          {row.leftAt && <span>left: {formatDateTimeShort(row.leftAt)}</span>}
                          {row.updatedAt && <span>updated: {formatDateTimeShort(row.updatedAt)}</span>}
                          {row.lastSeenAt && <span>last seen: {formatDateTimeShort(row.lastSeenAt)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {row.discordId && (
                          <Link
                            href={`${basePath}/users?discordId=${encodeURIComponent(row.discordId)}`}
                            className="inline-flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-100 text-xs font-semibold px-3 py-1.5 rounded-lg"
                          >
                            <UserRound size={13} />
                            사용자 조회
                          </Link>
                        )}
                        {fromHref && (
                          <Link
                            href={fromHref}
                            className="inline-flex items-center justify-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs font-semibold px-3 py-1.5 rounded-lg"
                          >
                            source로 병합
                          </Link>
                        )}
                        {toHref && (
                          <Link
                            href={toHref}
                            className="inline-flex items-center justify-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs font-semibold px-3 py-1.5 rounded-lg"
                          >
                            target으로 병합
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Discord ID 단건 조회</h2>
          <p className="text-xs text-gray-500 mt-1">
            닉네임 override와 현재 멤버/게스트 row를 Discord ID 기준으로 확인합니다.
          </p>
        </div>
        <form method="get" action={`${basePath}/users`} className="flex flex-col sm:flex-row gap-2">
          <input
            type="search"
            name="discordId"
            defaultValue={rawDiscordId}
            inputMode="numeric"
            pattern="[0-9]{15,25}"
            placeholder="Discord ID"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-100 text-sm font-semibold px-4 py-2 rounded-lg"
          >
            <Search size={14} />
            조회
          </button>
        </form>
        {searchError && <p className="text-xs text-red-400">{searchError}</p>}
      </section>

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <UserRound size={16} className="text-amber-300" />
          <h2 className="text-sm font-semibold text-gray-200">닉네임 변경</h2>
        </div>
        <form action={updateSiteNicknameOverride} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Discord ID</label>
            <input
              name="discordId"
              defaultValue={discordId ?? rawDiscordId}
              inputMode="numeric"
              pattern="[0-9]{15,25}"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">사이트 닉네임</label>
            <input
              name="nickname"
              defaultValue={lookup?.override?.nickname ?? ''}
              maxLength={SITE_NICKNAME_MAX_LENGTH}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500 block mb-1">사유 (선택)</label>
            <textarea
              name="reason"
              rows={2}
              maxLength={SITE_NICKNAME_REASON_MAX_LENGTH}
              placeholder="감사 로그에 남길 운영 메모"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold px-4 py-2 rounded-lg"
            >
              <Save size={14} />
              저장
            </button>
          </div>
        </form>
      </section>

      {lookup && (
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-4">
          {!lookup.overrideStoreAvailable && (
            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-rose-200 text-xs">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>site_user_nickname_overrides 마이그레이션이 아직 적용되지 않았습니다.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-gray-500 mb-1">Discord ID</div>
              <div className="font-mono text-white">{lookup.discordId}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">현재 override</div>
              <div className="text-white">{lookup.override?.nickname ?? '없음'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">마지막 변경</div>
              <div className="text-white">
                {lookup.override ? formatDateTimeShort(lookup.override.updatedAt) : '—'}
              </div>
            </div>
          </div>

          {lookup.override?.reason && (
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">사유</div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{lookup.override.reason}</p>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-gray-300 mb-2">
              현재 사이트 row ({lookup.presences.length})
            </h2>
            {lookup.presences.length === 0 ? (
              <p className="text-sm text-gray-500">
                현재 멤버/게스트 row는 없습니다. 저장한 닉네임은 이후 로그인 또는 row 생성 시 적용됩니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {lookup.presences.map((row) => (
                  <li
                    key={`${row.kind}:${row.guildId}`}
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-gray-800 border-gray-700 text-gray-300">
                        {row.kind === 'member' ? '멤버' : '게스트'}
                      </span>
                      {row.withdrawnAt && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border bg-rose-500/10 border-rose-500/30 text-rose-300">
                          탈퇴 기록
                        </span>
                      )}
                      <span className="text-white text-sm font-semibold">{row.username}</span>
                      {row.albionNickname && (
                        <span className="text-xs text-gray-500">Albion: {row.albionNickname}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{tenantLabel(lookup, row.guildId)}</span>
                      {row.updatedAt && <span>{formatDateTimeShort(row.updatedAt)}</span>}
                      <span className="font-mono">{row.guildId}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
