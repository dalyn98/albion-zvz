import Link from 'next/link'
import { Scale } from 'lucide-react'
import { reviewGuildHomeOwnershipDispute } from '@/app/super-admin/actions'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { listGuildHomeOwnershipDisputes } from '@/lib/guild-home-ownership-dispute-server'
import { getSuperAdminPath } from '@/lib/super-admin-path'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  submitted: '접수',
  under_review: '검토 중 · 공개 표면 중단',
  resolved_existing: '기존 연결 유지',
  resolved_reassigned: '새 워크스페이스로 재지정',
  rejected: '기각',
  cancelled: '취소',
}

const STATUS_CLASS: Record<string, string> = {
  submitted: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  under_review: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  resolved_existing: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  resolved_reassigned: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  rejected: 'border-gray-500/30 bg-gray-500/10 text-gray-300',
  cancelled: 'border-gray-500/30 bg-gray-500/10 text-gray-300',
}

export default async function GuildOwnershipDisputesPage() {
  const disputes = await listGuildHomeOwnershipDisputes()
  const basePath = getSuperAdminPath()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Scale size={22} className="text-amber-300" />
          길드 대표권 분쟁
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-gray-400">
          접수만으로는 아무 표면도 중단하지 않습니다. 근거를 확인한 뒤 검토를 시작해야 기존 공개 프로필과 가입 CTA만 임시 중단됩니다.
        </p>
      </div>

      {disputes.length === 0 ? (
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-8 text-center text-sm text-gray-500">
          접수된 대표권 분쟁이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {disputes.map((dispute) => (
            <li key={dispute.id} className="space-y-4 rounded-2xl border border-gray-700 bg-gray-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_CLASS[dispute.status] ?? STATUS_CLASS.cancelled}`}>
                      {STATUS_LABEL[dispute.status] ?? dispute.status}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDateTimeShort(dispute.submittedAt)}
                    </span>
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-white">
                    {dispute.albionGuildName}
                  </h2>
                  <p className="text-xs text-gray-500">Albion {dispute.albionServer}</p>
                </div>
                <code className="text-[10px] text-gray-600">{dispute.id}</code>
              </div>

              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <Link href={`${basePath}/tenants/${dispute.incumbentGuildId}`} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 text-gray-300 hover:border-amber-500/30">
                  기존 워크스페이스<br />
                  <code className="text-[10px] text-gray-500">{dispute.incumbentGuildId}</code>
                </Link>
                <Link href={`${basePath}/tenants/${dispute.claimantGuildId}`} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 text-gray-300 hover:border-amber-500/30">
                  신청 워크스페이스<br />
                  <code className="text-[10px] text-gray-500">{dispute.claimantGuildId}</code>
                </Link>
              </div>

              {dispute.evidenceSummary && (
                <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">신청 근거 요약</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{dispute.evidenceSummary}</p>
                  <p className="mt-2 text-[10px] text-gray-600">신청자 Discord: {dispute.reporterDiscordId}</p>
                </div>
              )}

              {dispute.status === 'submitted' && (
                <form action={reviewGuildHomeOwnershipDispute}>
                  <input type="hidden" name="disputeId" value={dispute.id} />
                  <input type="hidden" name="reviewAction" value="start_review" />
                  <button type="submit" className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black hover:bg-amber-400">
                    근거 확인 완료 · 수동 검토 시작
                  </button>
                </form>
              )}

              {dispute.status === 'under_review' && (
                <form action={reviewGuildHomeOwnershipDispute} className="space-y-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                  <input type="hidden" name="disputeId" value={dispute.id} />
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-gray-300">판정</span>
                    <select name="reviewAction" required className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white">
                      <option value="keep_existing">기존 연결 유지</option>
                      <option value="reject">신고 기각</option>
                      <option value="reassign">신청 워크스페이스로 홈 길드 재지정</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-gray-300">판정 근거 요약 (10자 이상)</span>
                    <textarea name="resolutionNote" required minLength={10} maxLength={2000} rows={3} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white" />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-rose-200">재지정 선택 시에만 확인 문구</span>
                    <input name="confirmation" placeholder={`REASSIGN ${dispute.id}`} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-xs text-white" />
                  </label>
                  <p className="text-[11px] leading-relaxed text-gray-500">
                    재지정은 기존 워크스페이스의 홈 길드 연결과 공개 프로필만 설정 필요 상태로 되돌립니다. 회원·이벤트·포인트·리기어·재고 데이터는 이동하거나 삭제하지 않습니다.
                  </p>
                  <button type="submit" className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-bold text-white hover:bg-rose-400">
                    판정 확정
                  </button>
                </form>
              )}

              {dispute.resolutionNote && (
                <p className="rounded-lg bg-gray-950/50 px-3 py-2 text-xs text-gray-400">
                  판정 기록: {dispute.resolutionNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
