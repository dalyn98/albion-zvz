import 'server-only'

import {
  ephemeralReply,
  findDiscordModalValue,
  modalReply,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
} from '@/lib/discord-interactions'
import {
  buildSupportCodexApprovalComponents,
  buildSupportCodexFollowupModal,
  buildSupportCodexRequestModal,
  buildSupportCodexTicketPicker,
  isSupportCodexCustomId,
  isSupportCodexOperator,
  normalizeSupportCodexInstruction,
  parseSupportCodexCustomId,
  parseSupportCodexTicketSelection,
} from '@/lib/support-codex-control-core'
import {
  approveSupportCodexJob,
  cancelSupportCodexJob,
  createSupportCodexJob,
  listSupportCodexJobStatus,
  listSupportCodexTickets,
  loadSupportCodexJob,
  loadSupportCodexSettings,
  retrySupportCodexJob,
  syncSupportCodexJobMessage,
} from '@/lib/support-codex-control-service'
import { isSupportGuild } from '@/lib/discord-support-ticket-core'

function invokerId(payload: DiscordInteractionPayload): string | null {
  return payload.member?.user?.id ?? payload.user?.id ?? null
}

function dispatchEnabled(): boolean {
  return process.env.SUPPORT_CODEX_ENABLED?.trim().toLowerCase() !== 'false' &&
    (process.env.CODEX_WORKER_SECRET?.trim().length ?? 0) >= 32
}

function knownFailure(error: unknown): string | null {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('support_codex_job_active')) return '이 티켓에는 이미 승인 대기 또는 실행 중인 Codex 작업이 있습니다.'
  if (message.includes('support_codex_job_rate_limited')) return '시간당 Codex 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.'
  if (message.includes('support_codex_ticket_not_available')) return '티켓이 없거나 보존 기간이 지나 원문이 삭제되었습니다.'
  if (message.includes('support_codex_parent_not_available')) return '이전 작업을 이어갈 수 없습니다. 새 요청으로 시작하세요.'
  if (message.includes('support_codex_approval_expired')) return '승인 시간이 만료되었습니다. 다시 요청하세요.'
  if (message.includes('invalid_support_codex_job_transition')) return '현재 상태에서는 이 동작을 실행할 수 없습니다.'
  if (message.includes('support_codex_job_not_found')) return 'Codex 작업을 찾을 수 없습니다.'
  return null
}

async function requireControlContext(payload: DiscordInteractionPayload): Promise<{
  actorDiscordId: string
  supportGuildId: string
  controlChannelId: string
} | null> {
  const actorDiscordId = invokerId(payload)
  if (!isSupportCodexOperator(actorDiscordId)) return null
  if (!payload.guild_id || !isSupportGuild(payload.guild_id)) return null
  const settings = await loadSupportCodexSettings(payload.guild_id)
  if (!settings || payload.channel_id !== settings.channelId) return null
  return {
    actorDiscordId,
    supportGuildId: payload.guild_id,
    controlChannelId: settings.channelId,
  }
}

export function isDiscordSupportCodexInteraction(payload: DiscordInteractionPayload): boolean {
  return isSupportCodexCustomId(payload.data?.custom_id)
}

export function shouldDeferDiscordSupportCodexInteraction(
  payload: DiscordInteractionPayload,
): boolean {
  const parsed = parseSupportCodexCustomId(payload.data?.custom_id)
  return parsed?.kind !== 'picker' && parsed?.kind !== 'followup'
}

export async function handleDiscordSupportCodexInteraction(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const parsed = parseSupportCodexCustomId(payload.data?.custom_id)
  if (!parsed) return ephemeralReply('지원되지 않는 Codex 동작입니다.')
  const context = await requireControlContext(payload)
  if (!context) return ephemeralReply('이 기능은 지정된 소유자와 전용 채널에서만 사용할 수 있습니다.')

  try {
    if (parsed.kind === 'panel') {
      if (parsed.action === 'status') {
        const status = await listSupportCodexJobStatus(context.supportGuildId)
        return ephemeralReply(`**최근 Codex 작업**\n${status}`)
      }
      if (!dispatchEnabled()) return ephemeralReply('현재 Codex 티켓 실행이 비활성화되어 있습니다.')
      const tickets = await listSupportCodexTickets(context.supportGuildId)
      return ephemeralReply(
        tickets.length > 0
          ? 'Codex에 전달할 티켓을 선택하세요.'
          : '현재 사용할 수 있는 티켓이 없습니다.',
        { components: buildSupportCodexTicketPicker(parsed.action, tickets) },
      )
    }

    if (parsed.kind === 'picker') {
      if (!dispatchEnabled()) return ephemeralReply('현재 Codex 티켓 실행이 비활성화되어 있습니다.')
      const ticketId = parseSupportCodexTicketSelection(payload.data?.values)
      if (!ticketId) return ephemeralReply('올바른 티켓을 선택하세요.')
      return modalReply(buildSupportCodexRequestModal(parsed.mode, ticketId))
    }

    if (parsed.kind === 'followup') {
      if (!dispatchEnabled()) return ephemeralReply('현재 Codex 티켓 실행이 비활성화되어 있습니다.')
      return modalReply(buildSupportCodexFollowupModal(parsed.jobId))
    }

    if (parsed.kind === 'modal') {
      if (!dispatchEnabled()) return ephemeralReply('현재 Codex 티켓 실행이 비활성화되어 있습니다.')
      const instruction = normalizeSupportCodexInstruction(
        findDiscordModalValue(payload.data?.components, 'instruction'),
      )
      if (!instruction) return ephemeralReply('Codex 요청 내용을 입력하세요.')
      const job = await createSupportCodexJob({
        supportGuildId: context.supportGuildId,
        ticketId: parsed.ticketId,
        mode: parsed.mode,
        instruction,
        actorDiscordId: context.actorDiscordId,
        interactionId: payload.id,
        controlChannelId: context.controlChannelId,
      })
      return ephemeralReply(
        [
          '**최종 승인이 필요합니다.**',
          `모드: ${job.mode === 'analyze' ? '읽기 전용 조사' : '격리 작업공간 수정 및 테스트'}`,
          '',
          job.instruction,
          '',
          '승인 전에는 Codex가 실행되지 않습니다. 승인은 30분 후 만료됩니다.',
        ].join('\n'),
        { components: buildSupportCodexApprovalComponents(job.id) },
      )
    }

    if (parsed.kind === 'followup_modal') {
      if (!dispatchEnabled()) return ephemeralReply('현재 Codex 티켓 실행이 비활성화되어 있습니다.')
      const instruction = normalizeSupportCodexInstruction(
        findDiscordModalValue(payload.data?.components, 'instruction'),
      )
      if (!instruction) return ephemeralReply('후속 요청 내용을 입력하세요.')
      const parent = await loadSupportCodexJob(parsed.jobId)
      if (!parent || parent.status !== 'completed') {
        return ephemeralReply('완료된 Codex 작업만 이어갈 수 있습니다.')
      }
      if (
        parent.support_guild_id !== context.supportGuildId ||
        parent.control_channel_id !== context.controlChannelId
      ) {
        return ephemeralReply('이 채널의 작업이 아닙니다.')
      }
      const job = await createSupportCodexJob({
        supportGuildId: context.supportGuildId,
        ticketId: parent.ticket_id,
        mode: parent.mode,
        instruction,
        actorDiscordId: context.actorDiscordId,
        interactionId: payload.id,
        controlChannelId: context.controlChannelId,
        parentJobId: parent.id,
      })
      return ephemeralReply(
        `이전 Codex 대화를 이어서 실행합니다.\n\n${job.instruction}\n\n승인은 30분 후 만료됩니다.`,
        { components: buildSupportCodexApprovalComponents(job.id) },
      )
    }

    const current = await loadSupportCodexJob(parsed.jobId)
    if (!current) return ephemeralReply('Codex 작업을 찾을 수 없습니다.')
    if (
      current.support_guild_id !== context.supportGuildId ||
      current.control_channel_id !== context.controlChannelId
    ) {
      return ephemeralReply('이 채널의 작업이 아닙니다.')
    }

    if (parsed.action === 'approve') {
      if (!dispatchEnabled()) return ephemeralReply('현재 Codex 티켓 실행이 비활성화되어 있습니다.')
      // The durable status card must exist before the job becomes claimable.
      // This prevents the worker and approval handler from racing to create it.
      await syncSupportCodexJobMessage(current)
      const job = await approveSupportCodexJob({
        jobId: current.id,
        actorDiscordId: context.actorDiscordId,
        interactionId: payload.id,
      })
      await syncSupportCodexJobMessage(job)
      return ephemeralReply(job.status === 'queued'
        ? '승인했습니다. 로컬 Codex 워커가 작업을 가져가면 실행됩니다.'
        : '승인 시간이 만료되어 요청이 취소되었습니다.')
    }
    if (parsed.action === 'cancel') {
      const job = await cancelSupportCodexJob({
        jobId: current.id,
        actorDiscordId: context.actorDiscordId,
        interactionId: payload.id,
      })
      await syncSupportCodexJobMessage(job)
      return ephemeralReply(job.status === 'running'
        ? '취소를 요청했습니다. 워커의 다음 heartbeat에서 실행을 중단합니다.'
        : 'Codex 작업을 취소했습니다.')
    }
    if (parsed.action === 'retry') {
      if (!dispatchEnabled()) return ephemeralReply('현재 Codex 티켓 실행이 비활성화되어 있습니다.')
      const job = await retrySupportCodexJob({
        jobId: current.id,
        actorDiscordId: context.actorDiscordId,
        interactionId: payload.id,
      })
      return ephemeralReply(
        `동일한 요청을 다시 실행하려면 최종 승인하세요.\n\n${job.instruction}`,
        { components: buildSupportCodexApprovalComponents(job.id) },
      )
    }
    await syncSupportCodexJobMessage(current)
    return ephemeralReply(`현재 상태: **${current.status}** · 시도 ${current.attempts}/3`)
  } catch (error) {
    const message = knownFailure(error)
    if (message) return ephemeralReply(message)
    throw error
  }
}
