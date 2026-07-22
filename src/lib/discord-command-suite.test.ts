import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import discordCommandCatalog from './discord-command-catalog.json'
import { resolveDiscordCommandLocale } from './discord-commands'

interface CatalogOption {
  name: string
  description: string
  description_localizations?: Record<string, string>
  type: number
  autocomplete?: boolean
  options?: CatalogOption[]
}

const EXPECTED_COMMAND_PATHS = [
  '/agm setup',
  '/agm help',
  '/agm me summary',
  '/agm me verify',
  '/agm event next',
  '/agm event browse',
  '/agm event status',
  '/agm event cancel',
  '/agm wallet balance',
  '/agm wallet send',
  '/agm wallet withdraw',
  '/agm wallet history',
  '/agm stats me',
  '/agm stats member',
  '/agm stats leaderboard',
  '/agm stats battle',
  '/agm regear eligible',
  '/agm regear status',
  '/agm craft queue',
  '/agm craft mine',
  '/agm craft claim',
  '/agm craft release',
  '/agm craft deliver',
  '/agm craft pickup',
  '/agm siphon balance',
  '/agm siphon history',
  '/agm shop status',
  '/agm shop order',
  '/agm shop reorder',
  '/agm admin approvals',
  '/agm admin event-create',
  '/agm admin event-start',
  '/agm admin points',
  '/agm admin quick-publish',
  '/agm admin dashboard',
] as const

const REMOVED_COMMAND_PATHS = [
  '/agm quick',
  '/agm guide',
  '/agm open',
  '/agm me profile',
  '/agm wallet open',
  '/agm admin killbot',
] as const

function leafPaths(root: string, options: readonly CatalogOption[]): string[] {
  return options.flatMap((option) => {
    const path = `${root} ${option.name}`
    if (option.type === 2) return leafPaths(path, option.options ?? [])
    return [path]
  })
}

function allCommandNodes(options: readonly CatalogOption[]): CatalogOption[] {
  return options.flatMap((option) => [option, ...allCommandNodes(option.options ?? [])])
}

describe('complete Discord command suite', () => {
  it('publishes the complete command tree and removes superseded aliases', () => {
    const command = discordCommandCatalog[0] as typeof discordCommandCatalog[0] & {
      options: CatalogOption[]
    }
    const paths = leafPaths('/agm', command.options)

    expect(paths).toEqual(EXPECTED_COMMAND_PATHS)
    for (const removed of REMOVED_COMMAND_PATHS) {
      expect(paths).not.toContain(removed)
    }
  })

  it('localizes every visible command node for all supported Discord locales', () => {
    const command = discordCommandCatalog[0] as typeof discordCommandCatalog[0] & {
      options: CatalogOption[]
    }
    const nodes = allCommandNodes(command.options)

    for (const node of nodes) {
      expect(node.description.length).toBeGreaterThan(0)
      expect(node.description_localizations?.ko).toBeTruthy()
      expect(node.description_localizations?.ja).toBeTruthy()
      expect(node.description_localizations?.['zh-CN']).toBeTruthy()
      expect(node.description_localizations?.['zh-TW']).toBeTruthy()
    }
  })

  it('uses autocomplete for tenant-scoped entity identifiers', () => {
    const command = discordCommandCatalog[0] as typeof discordCommandCatalog[0] & {
      options: CatalogOption[]
    }
    const nodes = allCommandNodes(command.options)
    const autocompleteOptions = nodes
      .filter((node) => node.autocomplete)
      .map((node) => node.name)

    expect(autocompleteOptions).toEqual([
      'event',
      'battle',
      'task',
      'task',
      'task',
      'task',
      'item',
      'order',
      'event',
    ])
  })

  it('answers in the invoking Discord client locale with a safe English fallback', () => {
    expect(resolveDiscordCommandLocale({ locale: 'ko' })).toBe('ko')
    expect(resolveDiscordCommandLocale({ locale: 'ja-JP' })).toBe('ja')
    expect(resolveDiscordCommandLocale({ locale: 'zh-CN' })).toBe('zh')
    expect(resolveDiscordCommandLocale({ locale: 'de' })).toBe('en')
  })

  it('defers slash-command database work before running the handler', () => {
    const routeSource = readFileSync(
      new URL('../app/api/discord/interactions/route.ts', import.meta.url),
      'utf8',
    )

    expect(routeSource).toMatch(
      /INTERACTION_TYPE_APPLICATION_COMMAND[\s\S]*deferredEphemeralReply\(\)[\s\S]*after\(/,
    )
  })
})
