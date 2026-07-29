import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const migration = source(
  'supabase/migrations/311_application_command_quick_execution.sql',
)
const discordSuite = source('src/lib/discord-command-suite.ts')
const discordCommerce = source('src/lib/discord-command-commerce-admin.ts')
const discordCraft = source('src/lib/discord-command-stats-craft.ts')
const discordRoute = source('src/app/api/discord/interactions/route.ts')
const discordConfirmation = source(
  'src/lib/discord-application-command-confirmations.ts',
)

describe('shared application command migration contract', () => {
  it('stores immutable tenant-scoped receipts and actor-bound expiring confirmations', () => {
    expect(migration).toMatch(
      /create table if not exists public\.application_command_runs[\s\S]*unique \(guild_id, idempotency_key\)/i,
    )
    expect(migration).toMatch(
      /create table if not exists public\.application_command_confirmations[\s\S]*unique \(guild_id, source_interaction_id, command_name\)/i,
    )
    expect(migration).toMatch(
      /expires_at > created_at[\s\S]*expires_at <= created_at \+ interval '15 minutes'/i,
    )
    expect(migration).toMatch(
      /confirmed_at is null or cancelled_at is null/i,
    )
    expect(migration).toMatch(
      /revoke update, delete, truncate, references, trigger[\s\S]*application_command_runs[\s\S]*from service_role/i,
    )
    expect(migration).not.toMatch(
      /grant .+application_command_(?:runs|confirmations).+to (?:anon|authenticated)/i,
    )
  })

  it('locks a confirmation and idempotency key in the same mutation transaction', () => {
    const lockIndex = migration.indexOf('pg_advisory_xact_lock')
    const confirmationIndex = migration.indexOf(
      'from public.application_command_confirmations as confirmation',
    )
    const receiptIndex = migration.indexOf(
      'from public.application_command_runs as run',
    )
    const firstDomainMutation = Math.min(
      ...[
        'public.transfer_points(',
        'public.submit_shop_order(',
        'public.deliver_craft_task(',
        'public.start_event_with_regear_policy_snapshots(',
      ].map((needle) => migration.indexOf(needle)),
    )
    expect(lockIndex).toBeGreaterThan(0)
    expect(confirmationIndex).toBeGreaterThan(lockIndex)
    expect(receiptIndex).toBeGreaterThan(confirmationIndex)
    expect(firstDomainMutation).toBeGreaterThan(receiptIndex)
    expect(migration).toMatch(
      /v_confirmation\.request_payload is distinct from p_request_payload/i,
    )
    expect(migration).toMatch(
      /p_source = 'discord' and p_confirmation_token is null/i,
    )
    expect(migration).toMatch(
      /set confirmed_at = coalesce\(confirmed_at, now\(\)\)/i,
    )
    const receiptLookup = migration.slice(
      receiptIndex,
      migration.indexOf('if v_existing.id is not null', receiptIndex),
    )
    expect(receiptLookup).not.toMatch(/for update/i)
    expect(migration).toMatch(
      /grant select, insert on public\.application_command_runs to service_role/i,
    )
  })

  it('dispatches all four domain commands and keeps craft inventory in the transaction', () => {
    expect(migration).toContain("'point.transfer'")
    expect(migration).toContain("'shop.order'")
    expect(migration).toContain("'craft.deliver'")
    expect(migration).toContain("'event.start'")
    expect(migration).toContain('public.transfer_points(')
    expect(migration).toContain('public.submit_shop_order(')
    expect(migration).toContain('public.deliver_craft_task(')
    expect(migration).toContain('public.start_event_with_regear_policy_snapshots(')
    expect(migration).toMatch(
      /public\.deliver_craft_task\([\s\S]*public\.adjust_inventory_gear\(/i,
    )
  })

  it('routes Discord high-risk commands through previews and the shared confirmation handler', () => {
    expect(discordSuite).toContain('preparePointTransferApplicationCommand')
    expect(discordSuite).not.toContain(".rpc('transfer_points'")
    expect(discordCommerce).toContain('prepareShopOrderApplicationCommand')
    expect(discordCommerce).toContain('prepareEventStartApplicationCommand')
    expect(discordCommerce).not.toContain(".rpc('submit_shop_order'")
    expect(discordCraft).toContain('prepareCraftDeliveryApplicationCommand')
    expect(discordCraft).not.toContain('deliverCraftTask(')
    expect(discordRoute).toContain(
      'isDiscordApplicationCommandConfirmationCustomId',
    )
    expect(discordRoute).toContain('deferredMessageUpdate()')
  })

  it('resolves a confirm-versus-cancel race from durable final state', () => {
    expect(discordConfirmation).toContain(
      ".select('confirmed_at, cancelled_at')",
    )
    expect(discordConfirmation).toContain(
      'return await completedConfirmationResponse({ row, tenant, actor, messages })',
    )
    expect(discordConfirmation).toMatch(
      /if \(latest\?\.cancelled_at\)[\s\S]*if \(latest\?\.confirmed_at\)/,
    )
  })
})
