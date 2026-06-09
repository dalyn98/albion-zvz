import { AlertTriangle, Save, Search, UserRound } from 'lucide-react'
import { updateSiteNicknameOverride } from '@/app/super-admin/actions'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { getSuperAdminPath } from '@/lib/super-admin-path'
import {
  normalizeDiscordId,
  SITE_NICKNAME_MAX_LENGTH,
  SITE_NICKNAME_REASON_MAX_LENGTH,
} from '@/lib/site-nickname'
import { lookupSiteUserByDiscordId, type SiteUserLookup } from '@/lib/super-admin-users'

export const dynamic = 'force-dynamic'

interface SearchParams {
  discordId?: string
}

function tenantLabel(lookup: SiteUserLookup, guildId: string): string {
  const tenant = lookup.tenants.get(guildId)
  if (!tenant) return guildId
  return `${tenant.name} (${tenant.slug})`
}

export default async function SuperAdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const rawDiscordId = (sp.discordId ?? '').trim()
  const discordId = rawDiscordId ? normalizeDiscordId(rawDiscordId) : null
  const searchError = rawDiscordId && !discordId ? '숫자 Discord ID를 입력하세요.' : null
  const lookup = discordId ? await lookupSiteUserByDiscordId(discordId) : null
  const basePath = getSuperAdminPath()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">사용자 닉네임</h1>
        <p className="text-gray-400 text-sm mt-1">
          Discord ID 기준으로 사이트 표시 닉네임을 전역 override 합니다.
        </p>
      </div>

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
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
