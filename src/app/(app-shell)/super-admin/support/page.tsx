import Link from 'next/link'
import { Activity, Bot, CircleAlert, Headphones, MessageSquareText, ShieldCheck } from 'lucide-react'
import { formatSupportTicketNumber } from '@/lib/discord-support-ticket-core'
import { getSupportOperationsSnapshot } from '@/lib/super-admin-support'
import { createSupportKnownIssue, updateSupportKnownIssueStatus } from './actions'

export const dynamic = 'force-dynamic'

const CATEGORIES = ['account', 'bot', 'battle', 'regear_shop', 'billing', 'bug', 'other'] as const
const ISSUE_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const

function Metric({ label, value, tone = 'text-white' }: {
  label: string
  value: number
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${tone}`}>{value.toLocaleString('ko-KR')}</p>
    </div>
  )
}

export default async function SuperAdminSupportPage() {
  const snapshot = await getSupportOperationsSnapshot()
  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100">
        <h1 className="text-xl font-bold">공식 지원 운영</h1>
        <p className="mt-2 text-sm">DISCORD_SUPPORT_GUILD_ID 설정이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Headphones size={22} className="text-indigo-300" />
          공식 지원 운영
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Discord 상담은 사람이 담당합니다. AI는 직원용 분류·요약·위험 신호만 기록합니다.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="전체 티켓" value={snapshot.metrics.total} />
        <Metric label="활성" value={snapshot.metrics.open} tone="text-sky-300" />
        <Metric label="미배정" value={snapshot.metrics.unassigned} tone="text-amber-300" />
        <Metric label="긴급" value={snapshot.metrics.urgent} tone="text-rose-300" />
        <Metric label="SLA 초과" value={snapshot.metrics.slaBreaches} tone="text-rose-300" />
        <Metric label="Helpful" value={snapshot.metrics.helpful} tone="text-emerald-300" />
        <Metric label="Not helpful" value={snapshot.metrics.unhelpful} tone="text-amber-300" />
        <Metric label="AI 완료" value={snapshot.metrics.aiCompleted} tone="text-violet-300" />
        <Metric label="AI 실패" value={snapshot.metrics.aiFailed} tone="text-rose-300" />
        <Metric label="AI 토큰" value={snapshot.metrics.aiInputTokens + snapshot.metrics.aiOutputTokens} />
      </section>

      <section className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <Activity size={16} /> 운영 헬스
          </h2>
          <span className={`rounded-full border px-2 py-1 text-xs ${snapshot.health.ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
            {snapshot.health.ok ? 'HEALTHY' : 'NEEDS ATTENTION'}
          </span>
        </div>
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {snapshot.health.checks.map((check) => (
            <div key={check.name} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
              <p className={`text-xs font-semibold ${check.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                {check.ok ? '✓' : '✕'} {check.name}
              </p>
              <p className="mt-1 text-xs text-gray-400">{check.message}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <CircleAlert size={16} /> Known Issue 등록
          </h2>
          <form action={createSupportKnownIssue} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="slug" required maxLength={120} placeholder="oauth-login-loop" className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white" />
              <select name="category" className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white">
                {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
            </div>
            <input name="title" required maxLength={120} placeholder="Public issue title" className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white" />
            <textarea name="summary" required maxLength={1500} rows={4} placeholder="English public summary. Do not include requester data." className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white" />
            <button className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400">등록 및 Forum 게시</button>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <h2 className="font-semibold text-white">Known Issues</h2>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {snapshot.knownIssues.length === 0 && <p className="text-sm text-gray-500">등록된 항목 없음</p>}
            {snapshot.knownIssues.map((issue) => (
              <div key={issue.id} className="rounded-lg border border-gray-800 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{issue.title}</p>
                    <p className="font-mono text-xs text-gray-500">{issue.slug} · {issue.category}</p>
                  </div>
                  {issue.forumPostId && (
                    <Link target="_blank" rel="noopener noreferrer" href={`https://discord.com/channels/${snapshot.supportGuildId}/${issue.forumPostId}`} className="text-xs text-indigo-300 hover:text-indigo-200">Discord</Link>
                  )}
                </div>
                <form action={updateSupportKnownIssueStatus} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={issue.id} />
                  <select name="status" defaultValue={issue.status} className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-white">
                    {ISSUE_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                  <button className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200">상태 저장</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
        <h2 className="flex items-center gap-2 font-semibold text-white"><MessageSquareText size={16} /> 최근 티켓</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-gray-500"><tr><th className="py-2 pr-3">Ticket</th><th className="pr-3">Subject</th><th className="pr-3">Status</th><th className="pr-3">Priority</th><th>AI</th></tr></thead>
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {snapshot.recentTickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td className="py-2 pr-3 font-mono">{ticket.threadId ? <Link target="_blank" rel="noopener noreferrer" className="text-indigo-300" href={`https://discord.com/channels/${snapshot.supportGuildId}/${ticket.threadId}`}>{formatSupportTicketNumber(ticket.ticketNumber)}</Link> : formatSupportTicketNumber(ticket.ticketNumber)}</td>
                  <td className="max-w-xs truncate pr-3">{ticket.subject}</td>
                  <td className="pr-3">{ticket.status}</td><td className="pr-3">{ticket.priority}</td><td>{ticket.aiStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
        <h2 className="flex items-center gap-2 font-semibold text-white"><Bot size={16} /> 직원용 AI 분석</h2>
        <p className="mt-1 text-xs text-gray-400">사용자 답변 생성, 자동 우선순위 변경, 자동 종료 기능은 없습니다.</p>
        <div className="mt-3 space-y-2">
          {snapshot.recentAnalyses.length === 0 && <p className="text-sm text-gray-500">분석 내역 없음</p>}
          {snapshot.recentAnalyses.map((analysis) => (
            <div key={analysis.id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-violet-200">{analysis.category}</span>
                <span className="text-gray-500">{Math.round(analysis.confidence * 100)}%</span>
                <span className={analysis.urgency === 'urgent' ? 'text-rose-300' : 'text-gray-400'}>{analysis.urgency}</span>
                <span className="text-gray-600">{analysis.modelId}</span>
              </div>
              <p className="mt-2 text-sm text-gray-200">{analysis.summary}</p>
              <p className="mt-1 text-xs text-gray-500">{analysis.riskFlags.join(', ')}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-2 text-xs text-gray-500"><ShieldCheck size={14} /> 지원 데이터는 service-role 전용이며 종료 후 보존 정책에 따라 삭제됩니다.</div>
    </div>
  )
}
