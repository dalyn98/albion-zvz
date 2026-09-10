import type { DiscordChannelPayload } from '@/lib/discord'
import type {
  DiscordMessageComponent,
  DiscordModalComponent,
} from '@/lib/discord-interactions'
import { formatSupportTicketNumber } from '@/lib/discord-support-ticket-core'

export const SUPPORT_CODEX_OPERATOR_DISCORD_ID = '490294888605155339'
export const SUPPORT_CODEX_PREFIX = 'support-codex:v1'

export type SupportCodexMode = 'analyze' | 'implement'
export type SupportCodexStatus =
  | 'pending_approval'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected'

export interface SupportCodexTicketOption {
  id: string
  ticketNumber: number | string
  subject: string
  category: string
  status: string
}

export interface SupportCodexJobRow {
  id: string
  ticket_id: string
  parent_job_id: string | null
  support_guild_id: string
  mode: SupportCodexMode
  instruction: string
  status: SupportCodexStatus
  requested_by_discord_id: string
  approved_by_discord_id: string | null
  request_interaction_id: string
  approval_interaction_id: string | null
  control_channel_id: string
  status_message_id: string | null
  base_git_sha: string | null
  workspace_key: string
  codex_thread_id: string | null
  result: Record<string, unknown>
  error_code: string | null
  attempts: number
  available_at: string
  approval_expires_at: string
  approved_at: string | null
  started_at: string | null
  completed_at: string | null
  cancel_requested_at: string | null
  lease_token: string | null
  lease_owner: string | null
  lease_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface SupportCodexResult {
  outcome: 'completed' | 'needs_input'
  summary: string
  diagnosis: string
  filesChanged: string[]
  tests: string[]
  risks: string[]
  nextActions: string[]
  worktree?: string
  usage?: {
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g

export type ParsedSupportCodexCustomId =
  | { kind: 'panel'; action: SupportCodexMode | 'status' }
  | { kind: 'picker'; mode: SupportCodexMode }
  | { kind: 'modal'; mode: SupportCodexMode; ticketId: string }
  | { kind: 'followup'; jobId: string }
  | { kind: 'followup_modal'; jobId: string }
  | { kind: 'job'; action: 'approve' | 'cancel' | 'retry' | 'refresh'; jobId: string }

export function isSupportCodexOperator(
  discordId: string | null | undefined,
): discordId is typeof SUPPORT_CODEX_OPERATOR_DISCORD_ID {
  return discordId === SUPPORT_CODEX_OPERATOR_DISCORD_ID
}

export function supportCodexPanelCustomId(action: SupportCodexMode | 'status'): string {
  return `${SUPPORT_CODEX_PREFIX}:panel:${action}`
}

export function supportCodexPickerCustomId(mode: SupportCodexMode): string {
  return `${SUPPORT_CODEX_PREFIX}:picker:${mode}`
}

export function supportCodexModalCustomId(mode: SupportCodexMode, ticketId: string): string {
  return `${SUPPORT_CODEX_PREFIX}:modal:${mode}:${ticketId}`
}

export function supportCodexFollowupCustomId(jobId: string): string {
  return `${SUPPORT_CODEX_PREFIX}:followup:${jobId}`
}

export function supportCodexFollowupModalCustomId(jobId: string): string {
  return `${SUPPORT_CODEX_PREFIX}:followup-modal:${jobId}`
}

export function supportCodexJobCustomId(
  action: 'approve' | 'cancel' | 'retry' | 'refresh',
  jobId: string,
): string {
  return `${SUPPORT_CODEX_PREFIX}:job:${action}:${jobId}`
}

export function parseSupportCodexCustomId(value: unknown): ParsedSupportCodexCustomId | null {
  if (typeof value !== 'string' || !value.startsWith(`${SUPPORT_CODEX_PREFIX}:`)) return null
  const parts = value.split(':')
  if (parts.length === 4 && parts[2] === 'panel') {
    const action = parts[3]
    if (action === 'analyze' || action === 'implement' || action === 'status') {
      return { kind: 'panel', action }
    }
  }
  if (parts.length === 4 && parts[2] === 'picker') {
    const mode = parts[3]
    if (mode === 'analyze' || mode === 'implement') return { kind: 'picker', mode }
  }
  if (parts.length === 5 && parts[2] === 'modal') {
    const mode = parts[3]
    const ticketId = parts[4] ?? ''
    if ((mode === 'analyze' || mode === 'implement') && UUID_PATTERN.test(ticketId)) {
      return { kind: 'modal', mode, ticketId }
    }
  }
  if (parts.length === 4 && parts[2] === 'followup' && UUID_PATTERN.test(parts[3] ?? '')) {
    return { kind: 'followup', jobId: parts[3] }
  }
  if (parts.length === 4 && parts[2] === 'followup-modal' && UUID_PATTERN.test(parts[3] ?? '')) {
    return { kind: 'followup_modal', jobId: parts[3] }
  }
  if (parts.length === 5 && parts[2] === 'job' && UUID_PATTERN.test(parts[4] ?? '')) {
    const action = parts[3]
    if (action === 'approve' || action === 'cancel' || action === 'retry' || action === 'refresh') {
      return { kind: 'job', action, jobId: parts[4] }
    }
  }
  return null
}

export function isSupportCodexCustomId(value: unknown): boolean {
  return parseSupportCodexCustomId(value) !== null
}

export function normalizeSupportCodexInstruction(value: string): string | null {
  const normalized = value
    .replace(CONTROL_CHARACTERS, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, 2000)
  return normalized || null
}

export function buildSupportCodexPanelPayload(): DiscordChannelPayload {
  return {
    embeds: [{
      title: 'Codex 티켓 컨트롤',
      description: [
        '공식 지원 티켓을 Codex에 직접 요청하는 소유자 전용 패널입니다.',
        '',
        '**조사**는 저장소를 읽고 원인과 수정 계획만 제안합니다.',
        '**구현**은 격리된 git worktree에서 수정과 테스트를 수행합니다.',
        '모든 요청은 최종 승인 후 실행되며 commit, push, 배포, 마이그레이션 적용은 금지됩니다.',
      ].join('\n'),
      color: 0x10a37f,
      footer: { text: `Owner only · ${SUPPORT_CODEX_OPERATOR_DISCORD_ID}` },
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, label: '티켓 조사', custom_id: supportCodexPanelCustomId('analyze'), emoji: { name: '🔎' } },
        { type: 2, style: 3, label: '수정 및 테스트', custom_id: supportCodexPanelCustomId('implement'), emoji: { name: '🛠️' } },
        { type: 2, style: 2, label: '작업 현황', custom_id: supportCodexPanelCustomId('status'), emoji: { name: '📋' } },
      ],
    }],
    allowed_mentions: { parse: [] },
  }
}

export function buildSupportCodexTicketPicker(
  mode: SupportCodexMode,
  tickets: SupportCodexTicketOption[],
): DiscordMessageComponent[] {
  return [{
    type: 1,
    components: [{
      type: 3,
      custom_id: supportCodexPickerCustomId(mode),
      placeholder: tickets.length > 0 ? 'Codex에 전달할 티켓을 선택하세요' : '사용 가능한 티켓이 없습니다',
      min_values: 1,
      max_values: 1,
      disabled: tickets.length === 0,
      options: tickets.length > 0
        ? tickets.slice(0, 25).map((ticket) => ({
          label: `${formatSupportTicketNumber(ticket.ticketNumber)} · ${ticket.subject}`.slice(0, 100),
          value: ticket.id,
          description: `${ticket.category} · ${ticket.status}`.slice(0, 100),
        }))
        : [{ label: '티켓 없음', value: 'none' }],
    }],
  }]
}

export function parseSupportCodexTicketSelection(values: unknown): string | null {
  if (!Array.isArray(values) || values.length !== 1) return null
  const value = values[0]
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null
}

export function buildSupportCodexRequestModal(
  mode: SupportCodexMode,
  ticketId: string,
): { customId: string; title: string; components: DiscordModalComponent[] } {
  return {
    customId: supportCodexModalCustomId(mode, ticketId),
    title: mode === 'analyze' ? 'Codex 티켓 조사 요청' : 'Codex 수정 및 테스트 요청',
    components: [{
      type: 18,
      label: 'Codex에게 요청할 내용',
      description: '티켓 내용은 자동으로 포함됩니다. 원하는 조사·수정 범위를 적으세요.',
      component: {
        type: 4,
        custom_id: 'instruction',
        style: 2,
        min_length: 1,
        max_length: 2000,
        required: true,
        value: mode === 'analyze'
          ? '티켓의 원인을 코드에서 조사하고, 근거와 안전한 수정 계획을 제시해.'
          : '티켓의 원인을 조사하고 격리된 작업공간에서 수정한 뒤 관련 테스트를 실행해.',
      },
    }],
  }
}

export function buildSupportCodexFollowupModal(jobId: string): {
  customId: string
  title: string
  components: DiscordModalComponent[]
} {
  return {
    customId: supportCodexFollowupModalCustomId(jobId),
    title: 'Codex 후속 요청',
    components: [{
      type: 18,
      label: '후속 요청',
      description: '이전 Codex 대화와 작업공간을 이어서 사용합니다.',
      component: {
        type: 4,
        custom_id: 'instruction',
        style: 2,
        min_length: 1,
        max_length: 2000,
        required: true,
      },
    }],
  }
}

export function buildSupportCodexApprovalComponents(jobId: string): DiscordMessageComponent[] {
  return [{
    type: 1,
    components: [
      { type: 2, style: 3, label: '실행 승인', custom_id: supportCodexJobCustomId('approve', jobId), emoji: { name: '✅' } },
      { type: 2, style: 4, label: '취소', custom_id: supportCodexJobCustomId('cancel', jobId), emoji: { name: '✖️' } },
    ],
  }]
}

function statusLabel(status: SupportCodexStatus): string {
  return {
    pending_approval: '승인 대기',
    queued: '실행 대기',
    running: '실행 중',
    completed: '완료',
    failed: '실패',
    cancelled: '취소됨',
    rejected: '거절됨',
  }[status]
}

function resultString(result: Record<string, unknown>, key: string): string {
  const value = result[key]
  return typeof value === 'string' ? value.trim() : ''
}

function resultList(result: Record<string, unknown>, key: string): string[] {
  const value = result[key]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).slice(0, 12)
    : []
}

export function buildSupportCodexJobPayload(input: {
  job: SupportCodexJobRow
  ticketNumber: number | string
  ticketSubject: string
}): DiscordChannelPayload {
  const { job } = input
  const result = job.result ?? {}
  const summary = resultString(result, 'summary')
  const diagnosis = resultString(result, 'diagnosis')
  const files = resultList(result, 'filesChanged')
  const tests = resultList(result, 'tests')
  const risks = resultList(result, 'risks')
  const nextActions = resultList(result, 'nextActions')
  const worktree = resultString(result, 'worktree')
  const lines = [
    `**상태** ${statusLabel(job.status)}${job.cancel_requested_at && job.status === 'running' ? ' · 취소 요청됨' : ''}`,
    `**모드** ${job.mode === 'analyze' ? '읽기 전용 조사' : '격리 작업공간 수정'}`,
    `**시도** ${job.attempts}/3`,
    '',
    '**요청**',
    job.instruction,
  ]
  if (summary) lines.push('', '**결과 요약**', summary)
  if (diagnosis) lines.push('', '**진단**', diagnosis)
  if (files.length > 0) lines.push('', '**변경 파일**', files.map((entry) => `- ${entry}`).join('\n'))
  if (tests.length > 0) lines.push('', '**테스트**', tests.map((entry) => `- ${entry}`).join('\n'))
  if (risks.length > 0) lines.push('', '**주의사항**', risks.map((entry) => `- ${entry}`).join('\n'))
  if (nextActions.length > 0) lines.push('', '**다음 작업**', nextActions.map((entry) => `- ${entry}`).join('\n'))
  if (worktree) lines.push('', `**작업공간 ID** \`${worktree}\``)
  if (job.error_code) lines.push('', `**오류 코드** \`${job.error_code}\``)

  const components: DiscordMessageComponent[] = []
  if (job.status === 'queued' || job.status === 'running') {
    components.push({ type: 1, components: [
      { type: 2, style: 2, label: '새로고침', custom_id: supportCodexJobCustomId('refresh', job.id) },
      { type: 2, style: 4, label: '취소', custom_id: supportCodexJobCustomId('cancel', job.id) },
    ] })
  } else if (job.status === 'completed') {
    components.push({ type: 1, components: [
      { type: 2, style: 1, label: '후속 요청', custom_id: supportCodexFollowupCustomId(job.id) },
      { type: 2, style: 2, label: '새로고침', custom_id: supportCodexJobCustomId('refresh', job.id) },
    ] })
  } else if (job.status === 'failed' || job.status === 'cancelled') {
    components.push({ type: 1, components: [
      { type: 2, style: 1, label: '다시 요청', custom_id: supportCodexJobCustomId('retry', job.id) },
      { type: 2, style: 2, label: '새로고침', custom_id: supportCodexJobCustomId('refresh', job.id) },
    ] })
  }

  return {
    embeds: [{
      title: `${formatSupportTicketNumber(input.ticketNumber)} · ${input.ticketSubject}`.slice(0, 256),
      description: lines.join('\n').slice(0, 4096),
      color: job.status === 'completed'
        ? 0x57f287
        : job.status === 'failed'
          ? 0xed4245
          : job.status === 'running'
            ? 0x10a37f
            : 0x5865f2,
      footer: { text: `Codex job ${job.id}` },
    }],
    components,
    allowed_mentions: { parse: [] },
  }
}
