import { AlertTriangle, Save, Search, UserRound } from 'lucide-react'
import { mergeMemberAccountsAction } from '@/app/super-admin/actions'
import { previewMemberAccountMerge, type AccountMergePreview } from '@/lib/super-admin-account-merge'
import { getSuperAdminPath } from '@/lib/super-admin-path'
import { getAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface SearchParams {
  tenantId?: string
  fromDiscordId?: string
  toDiscordId?: string
  merged?: string
}

interface TenantOption {
  id: string
  name: string
  slug: string
  status: string
}

async function listTenantOptions(): Promise<TenantOption[]> {
  const { data, error } = await getAdminClient()
    .from('tenants')
    .select('id, name, slug, status')
    .order('name', { ascending: true })
    .limit(300)

  if (error) throw new Error(`tenant list failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    status: row.status as string,
  }))
}

function countEntries(preview: AccountMergePreview): Array<[string, number]> {
  return Object.entries(preview.counts)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
}

function blockerLabel(blocker: string): string {
  const labels: Record<string, string> = {
    source_member_missing: 'source 계정의 멤버 row가 없습니다.',
    target_member_missing: 'target 계정의 멤버 row가 없습니다.',
    exchange_pending_conflict: 'source pending 환전 요청을 옮기면 target pending 환전 요청과 충돌합니다.',
    slot_event_conflict: '같은 이벤트에 source/target 모두 슬롯이 있습니다.',
    regear_event_conflict: '같은 이벤트에 source/target 모두 활성 리기어 청구가 있습니다.',
    event_payout_participant_conflict: 'pending 이벤트 보상 요청 participants 안에 source/target이 모두 있습니다.',
    event_tentative_conflict: '같은 이벤트에 source/target 모두 참가예정 row가 있습니다.',
    event_regear_participant_conflict: '같은 이벤트 수동 리기어 명단에 source/target이 모두 있습니다.',
    event_build_application_conflict: '같은 이벤트 빌드 신청에 source/target이 모두 있습니다.',
    settlement_line_conflict: '같은 정산 기간에 source/target 정산 라인이 모두 있습니다.',
    albion_identity_conflict: 'source/target의 Albion 캐릭터가 서로 다릅니다.',
  }
  return labels[blocker] ?? blocker
}

function warningLabel(warning: string): string {
  const labels: Record<string, string> = {
    source_member_will_be_withdrawn: '병합 후 source 계정은 탈퇴 처리되고 Albion identity가 비워집니다.',
    target_member_will_be_reactivated: 'target 계정은 현재 탈퇴 기록이지만 병합 실행 시 활성화됩니다.',
    target_has_existing_data: 'target 계정에도 기존 데이터가 있습니다. blocker가 없으면 함께 합산됩니다.',
    actor_history_will_not_be_rewritten: '처리자/승인자/생성자 같은 감사성 actor 필드는 바꾸지 않습니다.',
  }
  return labels[warning] ?? warning
}

function MemberCard({
  title,
  member,
}: {
  title: string
  member: AccountMergePreview['source']
}) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <UserRound size={14} className="text-amber-300" />
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      </div>
      {member ? (
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <div>
            <dt className="text-xs text-gray-500">Discord ID</dt>
            <dd className="font-mono text-white">{member.discordId}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">닉네임</dt>
            <dd className="text-white">{member.username ?? '없음'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Albion</dt>
            <dd className="text-white">
              {member.albionPlayerName ?? member.albionPlayerId ?? '미연동'}
              {member.albionServer ? <span className="text-gray-500"> · {member.albionServer}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">상태</dt>
            <dd className={member.withdrawnAt ? 'text-rose-300' : 'text-emerald-300'}>
              {member.withdrawnAt ? '탈퇴 기록' : '활성'}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-gray-500">row 없음</p>
      )}
    </div>
  )
}

export default async function SuperAdminAccountMergePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const tenantId = (sp.tenantId ?? '').trim()
  const fromDiscordId = (sp.fromDiscordId ?? '').trim()
  const toDiscordId = (sp.toDiscordId ?? '').trim()
  const merged = sp.merged === '1'
  const basePath = getSuperAdminPath()
  const tenants = await listTenantOptions()
  const shouldPreview = tenantId.length > 0 && fromDiscordId.length > 0 && toDiscordId.length > 0
  const preview = shouldPreview
    ? await previewMemberAccountMerge(getAdminClient(), { guildId: tenantId, fromDiscordId, toDiscordId })
    : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">계정 이전 병합</h1>
        <p className="text-gray-400 text-sm mt-1">
          같은 사람이 Discord 계정을 바꾼 경우 source 계정의 멤버 데이터를 target 계정으로 이전합니다.
        </p>
      </div>

      {merged && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 text-sm text-emerald-200">
          병합이 완료되었습니다. 실제 Discord 서버 역할/멤버 상태는 별도로 확인하세요.
        </div>
      )}

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
        <form method="get" action={`${basePath}/account-merge`} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500 block mb-1">테넌트</label>
            <select
              name="tenantId"
              defaultValue={tenantId}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">테넌트 선택</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.slug}) · {tenant.status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Source Discord ID</label>
            <input
              name="fromDiscordId"
              defaultValue={fromDiscordId}
              inputMode="numeric"
              pattern="[0-9]{15,25}"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Target Discord ID</label>
            <input
              name="toDiscordId"
              defaultValue={toDiscordId}
              inputMode="numeric"
              pattern="[0-9]{15,25}"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </div>
          <div className="md:col-span-4">
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-100 text-sm font-semibold px-4 py-2 rounded-lg"
            >
              <Search size={14} />
              Preview
            </button>
          </div>
        </form>
      </section>

      {preview && !preview.ok && (
        <section className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-sm text-rose-200">
          {preview.error}
        </section>
      )}

      {preview?.ok && (
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-4">
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-100 text-xs">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              병합은 되돌리기 어렵습니다. 실행 전 source가 기존 계정, target이 새 계정인지 다시 확인하세요.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
            <MemberCard title="Source" member={preview.preview.source} />
            <div className="hidden md:flex items-center text-gray-500 font-mono text-sm">→</div>
            <MemberCard title="Target" member={preview.preview.target} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
              <h2 className="text-sm font-semibold text-gray-200 mb-2">이전 예정 row</h2>
              {countEntries(preview.preview).length === 0 ? (
                <p className="text-sm text-gray-500">source 계정에서 이전할 row가 없습니다.</p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {countEntries(preview.preview).map(([key, count]) => (
                    <li key={key} className="flex items-center justify-between gap-3 border border-gray-800 rounded-lg px-2 py-1">
                      <span className="text-gray-300 font-mono text-xs">{key}</span>
                      <span className="text-white font-semibold">{count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-200 mb-2">Blockers</h2>
                {preview.preview.blockers.length === 0 ? (
                  <p className="text-sm text-emerald-300">실행 가능</p>
                ) : (
                  <ul className="space-y-1 text-sm text-rose-300">
                    {preview.preview.blockers.map((blocker) => (
                      <li key={blocker}>- {blockerLabel(blocker)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-200 mb-2">Warnings</h2>
                <ul className="space-y-1 text-sm text-amber-200">
                  {preview.preview.warnings.map((warning) => (
                    <li key={warning}>- {warningLabel(warning)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {preview.preview.canMerge ? (
            <form action={mergeMemberAccountsAction} className="bg-gray-950 border border-amber-500/30 rounded-lg p-3 space-y-3">
              <input type="hidden" name="tenantId" value={tenantId} />
              <input type="hidden" name="fromDiscordId" value={fromDiscordId} />
              <input type="hidden" name="toDiscordId" value={toDiscordId} />
              <div>
                <label className="text-xs text-gray-500 block mb-1">사유</label>
                <textarea
                  name="reason"
                  rows={2}
                  maxLength={500}
                  placeholder="지원 티켓, 유저 요청 근거 등"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">확인 문구</label>
                <input
                  name="confirmation"
                  required
                  pattern="MERGE"
                  placeholder="MERGE"
                  className="w-full md:w-64 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold px-4 py-2 rounded-lg"
              >
                <Save size={14} />
                병합 실행
              </button>
            </form>
          ) : (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-sm text-rose-200">
              blocker가 있어 실행할 수 없습니다. 충돌 데이터를 먼저 정리한 뒤 다시 preview 하세요.
            </div>
          )}
        </section>
      )}
    </div>
  )
}
