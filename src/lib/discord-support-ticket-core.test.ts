import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCategoryPicker,
  buildTicketActionComponents,
  buildTicketModal,
  formatSupportTicketNumber,
  isSupportGuild,
  normalizeSupportTicketInput,
  parseSelectedCategory,
  parseSupportCustomId,
  parseSupportTicketNumber,
  supportActionCustomId,
  supportCreateCustomId,
  type DiscordSupportMessages,
  type SupportTicketRow,
} from './discord-support-ticket-core'

const messages = new Proxy({}, {
  get: (_target, key) => String(key),
}) as DiscordSupportMessages

const ticket: SupportTicketRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ticket_number: 12,
  support_guild_id: '123456789012345678',
  opener_discord_id: '223456789012345678',
  opener_name_snapshot: 'Requester',
  opener_locale: 'ko',
  related_tenant_id: null,
  related_guild_hint: null,
  category: 'bug',
  subject: 'Problem',
  description: 'Details',
  status: 'open',
  priority: 'normal',
  assignee_discord_id: null,
  thread_id: null,
  header_message_id: null,
  create_interaction_id: '323456789012345678',
  discord_sync_status: 'pending',
  discord_sync_attempts: 0,
  discord_sync_error: null,
  assigned_at: null,
  resolved_at: null,
  closed_at: null,
  last_reminded_at: null,
  thread_deleted_at: null,
  triaged_at: null,
  triaged_by_discord_id: null,
  priority_updated_by_discord_id: null,
  ai_status: 'not_requested',
  ai_last_analyzed_at: null,
  created_at: '2026-08-04T00:00:00.000Z',
  updated_at: '2026-08-04T00:00:00.000Z',
}

describe('Discord support ticket core', () => {
  const previousGuildId = process.env.DISCORD_SUPPORT_GUILD_ID

  afterEach(() => {
    if (previousGuildId === undefined) delete process.env.DISCORD_SUPPORT_GUILD_ID
    else process.env.DISCORD_SUPPORT_GUILD_ID = previousGuildId
  })

  it('fails closed unless the interaction guild matches the configured support guild', () => {
    delete process.env.DISCORD_SUPPORT_GUILD_ID
    expect(isSupportGuild('123456789012345678')).toBe(false)
    process.env.DISCORD_SUPPORT_GUILD_ID = '123456789012345678'
    expect(isSupportGuild('123456789012345678')).toBe(true)
    expect(isSupportGuild('923456789012345678')).toBe(false)
  })

  it('parses only versioned, bounded support component ids', () => {
    expect(parseSupportCustomId(supportCreateCustomId())).toEqual({ kind: 'create' })
    expect(parseSupportCustomId('support-ticket:v1:category-picker')).toEqual({ kind: 'category_picker' })
    expect(parseSupportCustomId(supportActionCustomId('assign', ticket.id))).toEqual({
      kind: 'action', action: 'assign', ticketId: ticket.id,
    })
    expect(parseSupportCustomId('support-ticket:v1:action:delete:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeNull()
  })

  it('normalizes bounded modal input without retaining control characters', () => {
    expect(normalizeSupportTicketInput({
      subject: '  Login\u200b   failure  ',
      description: 'first\r\n\n\n\nsecond\u0000',
      guildHint: '  menhera  ',
    })).toEqual({
      subject: 'Login failure',
      description: 'first\n\n\nsecond',
      guildHint: 'menhera',
    })
    expect(normalizeSupportTicketInput({ subject: ' ', description: 'x', guildHint: '' })).toBeNull()
  })

  it('builds ticket modals with current Label components', () => {
    const modal = buildTicketModal('bug', messages)

    expect(modal).toHaveLength(3)
    expect(modal.map((component) => component.type)).toEqual([18, 18, 18])
    expect(modal[0]).toMatchObject({
      type: 18,
      label: 'subjectLabel',
      component: { type: 4, custom_id: 'subject', required: true },
    })
  })

  it('round-trips ticket numbers and rejects malformed values', () => {
    expect(formatSupportTicketNumber(12)).toBe('T-000012')
    expect(parseSupportTicketNumber('t-000012')).toBe(12)
    expect(parseSupportTicketNumber('T--12')).toBeNull()
  })

  it('offers every category and resolves the selected encoded value', () => {
    const picker = buildCategoryPicker(messages)
    const select = picker[0].components[0]
    expect(select.type).toBe(3)
    if (select.type !== 3) throw new Error('expected string select')
    expect(select.options).toHaveLength(7)
    expect(parseSelectedCategory([select.options[0].value])).toBe('account')
    expect(parseSelectedCategory([])).toBeNull()
  })

  it('removes actions from closed tickets and limits requester resolution actions', () => {
    expect(buildTicketActionComponents({ ...ticket, status: 'closed' }, messages)).toEqual([])
    const resolved = buildTicketActionComponents({ ...ticket, status: 'resolved' }, messages)
    expect(resolved[0].components).toHaveLength(3)
  })
})
