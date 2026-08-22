import { AlertTriangle, ShieldCheck, ShieldX } from 'lucide-react'
import {
  grantAlbionResourceExceptionAction,
  revokeAlbionResourceExceptionAction,
} from '@/app/super-admin/actions'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { listSuperAdminAlbionResourceExceptions } from '@/lib/super-admin-albion-exceptions'

export const dynamic = 'force-dynamic'

export default async function SuperAdminAlbionExceptionsPage() {
  const snapshot = await listSuperAdminAlbionResourceExceptions()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Albion 인증 영구 예외</h1>
        <p className="text-gray-400 text-sm mt-1">
          실제 길드 소속은 그대로 보존하고, 특정 테넌트의 정확한 Discord↔Albion 캐릭터 연결에만 자원 접근 권한을 부여합니다.
        </p>
      </div>

      {!snapshot.storeAvailable && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-rose-200 text-xs">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>417번 Albion 인증 예외 마이그레이션이 아직 적용되지 않았습니다.</span>
        </div>
      )}

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">영구 예외 추가 또는 갱신</h2>
          <p className="text-xs text-gray-500 mt-1">
            현재 활성 Albion 연결을 서버에서 다시 읽어 Player ID에 고정합니다. 캐릭터를 바꾸면 기존 예외는 자동으로 효력을 잃습니다.
          </p>
        </div>
        <form
          action={grantAlbionResourceExceptionAction}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <div>
            <label className="text-xs text-gray-500 block mb-1">테넌트</label>
            <select
              name="guildId"
              required
              disabled={!snapshot.storeAvailable}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">선택하세요</option>
              {snapshot.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.slug}) · {tenant.status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Discord ID</label>
            <input
              name="discordId"
              inputMode="numeric"
              pattern="[0-9]{15,25}"
              required
              disabled={!snapshot.storeAvailable}
              placeholder="839318087542636545"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500 block mb-1">승인 사유</label>
            <textarea
              name="reason"
              minLength={3}
              maxLength={500}
              rows={2}
              required
              disabled={!snapshot.storeAvailable}
              placeholder="예외가 필요한 운영 사유"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!snapshot.storeAvailable}
              className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-bold px-4 py-2 rounded-lg"
            >
              <ShieldCheck size={14} />
              영구 예외 저장
            </button>
          </div>
        </form>
      </section>

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">
            현재 예외 ({snapshot.exceptions.length})
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            연결 불일치는 사용자가 캐릭터를 바꿔 현재 예외가 비활성화된 상태입니다.
          </p>
        </div>
        {snapshot.exceptions.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 영구 예외가 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {snapshot.exceptions.map((entry) => (
              <li
                key={`${entry.guildId}:${entry.discordId}`}
                className="bg-gray-950 border border-gray-800 rounded-xl p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        {entry.playerName}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          entry.currentBindingMatches
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                        }`}
                      >
                        {entry.currentBindingMatches ? '적용 중' : '연결 불일치'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {entry.tenantName} ({entry.tenantSlug})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      <div>
                        <span className="text-gray-500">Discord </span>
                        <span className="font-mono text-gray-200">{entry.discordId}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Player ID </span>
                        <span className="font-mono text-gray-200">{entry.playerId}</span>
                      </div>
                      <div className="text-gray-500">
                        {entry.server} · relation {entry.currentRelation ?? '없음'}
                      </div>
                      <div className="text-gray-500">
                        현재 길드 {entry.currentGuildName ?? '없음'}
                      </div>
                    </div>
                    <p className="text-xs text-gray-300 whitespace-pre-wrap">{entry.reason}</p>
                    <p className="text-[11px] text-gray-600">
                      {formatDateTimeShort(entry.grantedAt)} · 승인자 {entry.grantedByDiscordId}
                    </p>
                  </div>
                </div>
                <form
                  action={revokeAlbionResourceExceptionAction}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <input type="hidden" name="guildId" value={entry.guildId} />
                  <input type="hidden" name="discordId" value={entry.discordId} />
                  <input
                    name="reason"
                    minLength={3}
                    maxLength={500}
                    required
                    placeholder="해제 사유"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs font-semibold px-3 py-2 rounded-lg"
                  >
                    <ShieldX size={13} />
                    예외 해제
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
