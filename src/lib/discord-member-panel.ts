import 'server-only'

import {
  handleSlashCommand,
  loadDiscordBotMessages,
} from '@/lib/discord-commands'
import {
  buildDiscordMemberPanelExchangeConfirmCustomId,
  DISCORD_MEMBER_PANEL_CUSTOM_IDS,
  isDiscordMemberPanelCustomId,
  parseDiscordMemberPanelCustomId,
} from '@/lib/discord-member-panel-contract'
import {
  ephemeralReply,
  findDiscordModalValue,
  INTERACTION_TYPE_MESSAGE_COMPONENT,
  INTERACTION_TYPE_MODAL_SUBMIT,
  messageUpdateReply,
  modalReply,
  type DiscordInteractionOption,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
} from '@/lib/discord-interactions'
import { formatDiscordCommandMessage } from '@/lib/discord-command-suite-messages'
import { resolveDiscordPersonalLocale } from '@/lib/discord-personal-locale'

const EXCHANGE_AMOUNT_INPUT_ID = 'amount'
const POSTGRES_INT_MAX = 2_147_483_647
const EXCHANGE_AMOUNT_RE = /^[1-9]\d{0,9}$/

export function isDiscordMemberPanelInteraction(
  payload: Pick<DiscordInteractionPayload, 'data'>,
): boolean {
  return isDiscordMemberPanelCustomId(payload.data?.custom_id)
}

export function shouldDeferDiscordMemberPanelInteraction(
  payload: Pick<DiscordInteractionPayload, 'data'>,
): boolean {
  const action = parseDiscordMemberPanelCustomId(payload.data?.custom_id)
  return action?.kind === 'event' ||
    action?.kind === 'regear' ||
    action?.kind === 'exchange_confirm'
}

function commandPayload(input: {
  payload: DiscordInteractionPayload
  group: 'event' | 'wallet' | 'regear'
  command: 'next' | 'withdraw' | 'eligible'
  options?: DiscordInteractionOption[]
}): DiscordInteractionPayload {
  return {
    ...input.payload,
    data: {
      name: 'agm',
      options: [{
        name: input.group,
        type: 2,
        options: [{
          name: input.command,
          type: 1,
          options: input.options ?? [],
        }],
      }],
    },
  }
}

function parseExchangeAmount(value: string): number | null {
  const normalized = value.replace(/[,_\s]/g, '')
  if (!EXCHANGE_AMOUNT_RE.test(normalized)) return null
  const amount = Number(normalized)
  return Number.isSafeInteger(amount) && amount <= POSTGRES_INT_MAX ? amount : null
}

export async function handleDiscordMemberPanelInteraction(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const action = parseDiscordMemberPanelCustomId(payload.data?.custom_id)
  if (!action) {
    const fallbackMessages = await loadDiscordBotMessages(
      await resolveDiscordPersonalLocale(payload),
    )
    return ephemeralReply(fallbackMessages.unsupportedInteraction)
  }

  if (action.kind === 'event') {
    return handleSlashCommand(commandPayload({
      payload,
      group: 'event',
      command: 'next',
    }))
  }

  if (action.kind === 'regear') {
    return handleSlashCommand(commandPayload({
      payload,
      group: 'regear',
      command: 'eligible',
    }))
  }

  if (action.kind === 'exchange_confirm') {
    return handleSlashCommand(commandPayload({
      payload,
      group: 'wallet',
      command: 'withdraw',
      options: [{ name: 'amount', type: 4, value: action.amount }],
    }))
  }

  const locale = await resolveDiscordPersonalLocale(payload)
  const messages = await loadDiscordBotMessages(locale)

  if (action.kind === 'exchange') {
    if (payload.type !== INTERACTION_TYPE_MESSAGE_COMPONENT) {
      return ephemeralReply(messages.unsupportedInteraction)
    }
    return modalReply({
      customId: DISCORD_MEMBER_PANEL_CUSTOM_IDS.exchangeSubmit,
      title: messages.memberPanelExchangeModalTitle,
      components: [{
        type: 18,
        label: messages.memberPanelExchangeAmountLabel,
        component: {
          type: 4,
          custom_id: EXCHANGE_AMOUNT_INPUT_ID,
          style: 1,
          placeholder: messages.memberPanelExchangeAmountPlaceholder,
          min_length: 1,
          max_length: 13,
          required: true,
        },
      }],
    })
  }

  if (action.kind === 'exchange_submit') {
    if (payload.type !== INTERACTION_TYPE_MODAL_SUBMIT) {
      return ephemeralReply(messages.unsupportedInteraction)
    }
    const amount = parseExchangeAmount(
      findDiscordModalValue(payload.data?.components, EXCHANGE_AMOUNT_INPUT_ID),
    )
    if (amount == null) {
      return ephemeralReply(formatDiscordCommandMessage(messages.withdrawInvalidAmount, {
        max: POSTGRES_INT_MAX.toLocaleString('en-US'),
      }))
    }
    return ephemeralReply(
      formatDiscordCommandMessage(messages.memberPanelExchangeReview, {
        amount: amount.toLocaleString('en-US'),
      }),
      {
        components: [{
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: messages.memberPanelExchangeConfirm,
              custom_id: buildDiscordMemberPanelExchangeConfirmCustomId(amount),
            },
            {
              type: 2,
              style: 2,
              label: messages.memberPanelCancel,
              custom_id: DISCORD_MEMBER_PANEL_CUSTOM_IDS.exchangeCancel,
            },
          ],
        }],
      },
    )
  }

  return messageUpdateReply(messages.memberPanelExchangeCancelled, { components: [] })
}
