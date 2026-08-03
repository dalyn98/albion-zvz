// Discord Interactions endpoint — 슬래시 커맨드를 받는다.
//
// Discord 가 모든 인터랙션을 우리 서버로 POST 하고, 각 요청에는 Ed25519
// 서명이 헤더로 붙는다. 검증 실패 시 401 을 응답해야 Discord 가 endpoint 를
// 살아 있다고 판정 — 검증 파트 실패는 그 자체로 보안 이슈가 아니라 endpoint
// 등록 실패의 신호다.
//
// 또한 Discord 는 등록 검증 단계와 주기적 health check 로 type=1 (PING)
// 인터랙션을 보낸다. 그때는 type=1 (PONG) 으로 응답해야 한다.
//
// 표준 참고: https://discord.com/developers/docs/interactions/receiving-and-responding

import { after, NextResponse } from 'next/server'
import {
  autocompleteReply,
  deferredEphemeralReply,
  deferredMessageUpdate,
  editOriginalInteractionResponse,
  verifyDiscordSignature,
  isDiscordSignatureTimestampFresh,
  INTERACTION_TYPE_PING,
  INTERACTION_TYPE_APPLICATION_COMMAND,
  INTERACTION_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE,
  INTERACTION_TYPE_MESSAGE_COMPONENT,
  INTERACTION_TYPE_MODAL_SUBMIT,
  INTERACTION_RESPONSE_TYPE_PONG,
  INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
  INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE,
  type DiscordInteractionPayload,
} from '@/lib/discord-interactions'
import {
  DEFAULT_DISCORD_COMMAND_LOCALE,
  handleDiscordAppLoginInteraction,
  handleDiscordCommandAutocomplete,
  handleSlashCommand,
  loadDiscordBotMessages,
} from '@/lib/discord-commands'
import { isDiscordAppLoginCustomId } from '@/lib/discord-app-login'
import {
  handleDiscordEventInteraction,
  shouldDeferDiscordEventInteraction,
  shouldUpdateDiscordEventInteractionMessage,
} from '@/lib/discord-event-signups'
import {
  handleDiscordAdminApprovalInteraction,
  isDiscordAdminApprovalCustomId,
  shouldDeferDiscordAdminApprovalInteraction,
  shouldUpdateDiscordAdminApprovalInteractionMessage,
} from '@/lib/discord-admin-approvals'
import {
  handleDiscordSelfRolePanelInteraction,
  isDiscordSelfRolePanelCustomId,
} from '@/lib/discord-self-role-panel'
import {
  handleDiscordApplicationCommandConfirmation,
  isDiscordApplicationCommandConfirmationCustomId,
} from '@/lib/discord-application-command-confirmations'
import {
  handleDiscordSupportApplicationCommand,
  handleDiscordSupportInteraction,
  isDiscordSupportCommand,
  isDiscordSupportInteraction,
  shouldDeferDiscordSupportInteraction,
} from '@/lib/discord-support-ticket-interactions'
import { log } from '@/lib/log'

// Discord 는 3 초 안에 응답이 오지 않으면 endpoint 가 죽었다고 판단해
// 사용자에게 "interaction failed" 를 띄운다. DB 가 필요한 컴포넌트 동작은
// deferred ACK 를 먼저 보내고 after() 에서 원본 응답을 수정한다.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  if (!publicKey) {
    log.error('[discord/interactions] DISCORD_PUBLIC_KEY is not configured')
    return new NextResponse('Server misconfigured', { status: 500 })
  }

  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')
  if (!signature || !timestamp) {
    return new NextResponse('Bad signature', { status: 401 })
  }
  if (!isDiscordSignatureTimestampFresh(timestamp)) {
    return new NextResponse('Bad signature', { status: 401 })
  }

  const rawBody = await request.text()
  const ok = verifyDiscordSignature({
    publicKeyHex: publicKey,
    signatureHex: signature,
    timestamp,
    rawBody,
  })
  if (!ok) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  let payload: DiscordInteractionPayload
  try {
    payload = JSON.parse(rawBody) as DiscordInteractionPayload
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  // PING (type 1) 은 endpoint 검증 + health check. PONG 만 돌려주면 된다.
  if (payload.type === INTERACTION_TYPE_PING) {
    return NextResponse.json({ type: INTERACTION_RESPONSE_TYPE_PONG })
  }

  try {
    if (payload.type === INTERACTION_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE) {
      try {
        const response = await handleDiscordCommandAutocomplete(payload)
        return NextResponse.json(response)
      } catch (error) {
        log.warn('[discord/interactions] autocomplete failed', {
          guild_id: payload.guild_id,
          command: payload.data?.name,
          error: error instanceof Error ? error.message : String(error),
        })
        return NextResponse.json(autocompleteReply([]))
      }
    }

    if (payload.type === INTERACTION_TYPE_APPLICATION_COMMAND) {
      const deferredResponse = deferredEphemeralReply()
      after(async () => {
        try {
          const response = isDiscordSupportCommand(payload)
            ? await handleDiscordSupportApplicationCommand(payload)
            : await handleSlashCommand(payload)
          await editOriginalInteractionResponse(payload, response)
        } catch (error) {
          log.error('[discord/interactions] deferred slash command failed', error, {
            guild_id: payload.guild_id,
            channel_id: payload.channel_id,
          })
          try {
            const messages = await loadDiscordBotMessages(DEFAULT_DISCORD_COMMAND_LOCALE)
            await editOriginalInteractionResponse(payload, {
              type: INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
              data: { content: messages.handlerFailed, flags: 1 << 6 },
            })
          } catch (followupError) {
            log.error('[discord/interactions] deferred slash failure response failed', followupError, {
              guild_id: payload.guild_id,
            })
          }
        }
      })
      return NextResponse.json(deferredResponse)
    }

    if (
      payload.type === INTERACTION_TYPE_MESSAGE_COMPONENT ||
      payload.type === INTERACTION_TYPE_MODAL_SUBMIT
    ) {
      if (isDiscordSupportInteraction(payload)) {
        if (!shouldDeferDiscordSupportInteraction(payload)) {
          return NextResponse.json(await handleDiscordSupportInteraction(payload))
        }
        const deferredResponse = deferredEphemeralReply()
        after(async () => {
          try {
            const response = await handleDiscordSupportInteraction(payload)
            await editOriginalInteractionResponse(payload, response)
          } catch (error) {
            log.error('[discord/interactions] deferred support ticket handler failed', error, {
              interaction_type: payload.type,
              guild_id: payload.guild_id,
              channel_id: payload.channel_id,
            })
            try {
              const messages = await loadDiscordBotMessages(DEFAULT_DISCORD_COMMAND_LOCALE)
              await editOriginalInteractionResponse(payload, {
                type: INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
                data: { content: messages.handlerFailed, flags: 1 << 6 },
              })
            } catch (followupError) {
              log.error('[discord/interactions] support ticket failure response failed', followupError, {
                interaction_type: payload.type,
                guild_id: payload.guild_id,
              })
            }
          }
        })
        return NextResponse.json(deferredResponse)
      }

      if (isDiscordApplicationCommandConfirmationCustomId(payload.data?.custom_id)) {
        const deferredResponse = deferredMessageUpdate()
        after(async () => {
          try {
            const response = await handleDiscordApplicationCommandConfirmation(payload)
            await editOriginalInteractionResponse(payload, response)
          } catch (error) {
            log.error('[discord/interactions] application command confirmation failed', error, {
              guild_id: payload.guild_id,
              channel_id: payload.channel_id,
            })
            try {
              const messages = await loadDiscordBotMessages(DEFAULT_DISCORD_COMMAND_LOCALE)
              await editOriginalInteractionResponse(payload, {
                type: INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE,
                data: { content: messages.handlerFailed, components: [] },
              })
            } catch (followupError) {
              log.error(
                '[discord/interactions] application command confirmation response failed',
                followupError,
                { guild_id: payload.guild_id },
              )
            }
          }
        })
        return NextResponse.json(deferredResponse)
      }

      if (isDiscordAppLoginCustomId(payload.data?.custom_id)) {
        const response = await handleDiscordAppLoginInteraction(payload)
        return NextResponse.json(response)
      }

      if (isDiscordSelfRolePanelCustomId(payload.data?.custom_id)) {
        const deferredResponse = deferredEphemeralReply()
        after(async () => {
          try {
            const response = await handleDiscordSelfRolePanelInteraction(payload)
            await editOriginalInteractionResponse(payload, response)
          } catch (error) {
            log.error('[discord/interactions] deferred self-role handler failed', error, {
              interaction_type: payload.type,
              guild_id: payload.guild_id,
              channel_id: payload.channel_id,
            })
            try {
              const messages = await loadDiscordBotMessages(DEFAULT_DISCORD_COMMAND_LOCALE)
              await editOriginalInteractionResponse(payload, {
                type: INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
                data: { content: messages.handlerFailed, flags: 1 << 6 },
              })
            } catch (followupError) {
              log.error('[discord/interactions] deferred self-role failure response failed', followupError, {
                interaction_type: payload.type,
                guild_id: payload.guild_id,
              })
            }
          }
        })
        return NextResponse.json(deferredResponse)
      }

      if (isDiscordAdminApprovalCustomId(payload.data?.custom_id)) {
        if (shouldDeferDiscordAdminApprovalInteraction(payload)) {
          const shouldUpdateOriginalMessage = shouldUpdateDiscordAdminApprovalInteractionMessage(payload)
          const deferredResponse = shouldUpdateOriginalMessage
            ? deferredMessageUpdate()
            : deferredEphemeralReply()
          after(async () => {
            try {
              const response = await handleDiscordAdminApprovalInteraction(payload)
              await editOriginalInteractionResponse(payload, response)
            } catch (error) {
              log.error('[discord/interactions] deferred admin approval handler failed', error, {
                interaction_type: payload.type,
                guild_id: payload.guild_id,
              })
              try {
                const messages = await loadDiscordBotMessages(DEFAULT_DISCORD_COMMAND_LOCALE)
                await editOriginalInteractionResponse(payload, {
                  type: shouldUpdateOriginalMessage
                    ? INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE
                    : INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
                  data: {
                    content: messages.handlerFailed,
                    ...(shouldUpdateOriginalMessage ? {} : { flags: 1 << 6 }),
                    ...(shouldUpdateOriginalMessage ? { components: [] } : {}),
                  },
                })
              } catch (followupError) {
                log.error('[discord/interactions] deferred admin approval failure response failed', followupError, {
                  interaction_type: payload.type,
                  guild_id: payload.guild_id,
                })
              }
            }
          })
          return NextResponse.json(deferredResponse)
        }

        const response = await handleDiscordAdminApprovalInteraction(payload)
        return NextResponse.json(response)
      }

      if (shouldDeferDiscordEventInteraction(payload)) {
        const deferredResponse = shouldUpdateDiscordEventInteractionMessage(payload)
          ? deferredMessageUpdate()
          : deferredEphemeralReply()
        after(async () => {
          try {
            const response = await handleDiscordEventInteraction(payload)
            await editOriginalInteractionResponse(payload, response)
          } catch (error) {
            log.error('[discord/interactions] deferred handler failed', error, {
              interaction_type: payload.type,
              guild_id: payload.guild_id,
            })
            try {
              const messages = await loadDiscordBotMessages(DEFAULT_DISCORD_COMMAND_LOCALE)
              await editOriginalInteractionResponse(payload, {
                type: 4,
                data: {
                  content: messages.handlerFailed,
                  flags: 1 << 6,
                },
              })
            } catch (followupError) {
              log.error('[discord/interactions] deferred failure response failed', followupError, {
                interaction_type: payload.type,
                guild_id: payload.guild_id,
              })
            }
          }
        })
        return NextResponse.json(deferredResponse)
      }

      const response = await handleDiscordEventInteraction(payload)
      return NextResponse.json(response)
    }

    const messages = await loadDiscordBotMessages(DEFAULT_DISCORD_COMMAND_LOCALE)
    const response = {
      type: 4,
      data: { content: messages.unsupportedInteraction, flags: 1 << 6 },
    }
    return NextResponse.json(response)
  } catch (error) {
    // 핸들러 실패는 운영자만 알면 되고, 사용자에게는 ephemeral 안내. Discord
    // 가 본문 길이 제한이 있어 메시지를 짧게 — 자세한 디버깅은 서버 로그에서.
    log.error('[discord/interactions] handler failed', error, {
      interaction_type: payload.type,
      guild_id: payload.guild_id,
    })
    const messages = await loadDiscordBotMessages(DEFAULT_DISCORD_COMMAND_LOCALE)
    return NextResponse.json({
      type: 4,
      data: {
        content: messages.handlerFailed,
        flags: 1 << 6,
      },
    })
  }
}
