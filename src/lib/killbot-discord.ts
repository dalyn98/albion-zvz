import { EQUIPMENT_SLOTS, type EquipmentItem } from '@/lib/auto-regear-equipment'
import { renderKillbotCardPng } from '@/lib/killbot-card'
import {
  formatKillbotCompactFame,
  type KillbotBattleForceLine,
  type KillbotBattlePlayerLine,
  type KillbotBattleSummary,
  type KillbotBattleJuicyLine,
} from '@/lib/killbot-battle'
import type { KillbotVictimValueEstimate } from '@/lib/killbot-value'
import type {
  AlbionKillbotEvent,
  KillbotConfig,
  KillbotMatch,
  KillbotTarget,
} from '@/lib/killbot'

const DISCORD_API = 'https://discord.com/api/v10'
const DISCORD_TITLE_LIMIT = 256
const DISCORD_INLINE_FIELD_LIMIT = 25
const DISCORD_FIELD_VALUE_LIMIT = 1024
const KILLBOT_CARD_FILENAME = 'killbot-card.png'

interface DiscordEmbed {
  title?: string
  url?: string
  color?: number
  author?: { name: string }
  timestamp?: string
  thumbnail?: { url: string } | undefined
  image?: { url: string } | undefined
  description?: string
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  footer?: { text: string }
}

interface DiscordPayload {
  content?: string
  allowed_mentions: {
    parse: Array<'everyone' | 'roles' | 'users'>
    roles?: string[]
  }
  embeds: DiscordEmbed[]
}

interface DiscordFileAttachment {
  filename: string
  contentType: string
  data: Uint8Array
}

interface DiscordChannelMessage {
  payload: DiscordPayload
  files?: DiscordFileAttachment[]
}

function eventTimeOrNull(event: AlbionKillbotEvent): string | null {
  const date = new Date(event.TimeStamp)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function killboardUrl(eventId: number): string {
  return `https://albiononline.com/killboard/kill/${eventId}`
}

function formatFame(value: number): string {
  return value.toLocaleString('en-US')
}

function playerName(player: AlbionKillbotEvent['Killer'] | null | undefined): string {
  return String(player?.Name ?? '').trim() || 'Unknown'
}

function playerTitle(
  player: AlbionKillbotEvent['Killer'] | null | undefined,
  fallbackName: string,
): string {
  const name = fallbackName.trim() || playerName(player)
  const itemPower = Number(player?.AverageItemPower)
  if (!Number.isFinite(itemPower) || itemPower <= 0) return name
  return `${name} (${Math.round(itemPower)})`
}

function truncateDiscord(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(0, limit - 1))}…`
}

function markdownLink(label: string, url: string): string {
  const safeLabel = label
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
  return `[${safeLabel}](${url})`
}

function itemImageUrl(itemId: string): string {
  return `https://render.albiononline.com/v1/item/${encodeURIComponent(itemId)}.png?size=128`
}

function equipmentItemType(item: EquipmentItem | null | undefined): string | null {
  const type = typeof item?.Type === 'string' ? item.Type.trim() : ''
  return type.length > 0 ? type : null
}

function equipmentEntries(player: AlbionKillbotEvent['Killer'] | null | undefined): Array<{
  slot: string
  itemId: string
}> {
  const equipment = player?.Equipment
  if (!equipment) return []
  const entries: Array<{ slot: string; itemId: string }> = []
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = equipmentItemType(equipment[slot])
    if (!itemId) continue
    entries.push({ slot, itemId })
  }
  return entries
}

function participantSummary(event: AlbionKillbotEvent): string | null {
  const killerId = String(event.Killer?.Id ?? '').trim()
  const killerName = playerName(event.Killer)
  const names = (event.Participants ?? [])
    .filter((player) => {
      const id = String(player?.Id ?? '').trim()
      if (killerId && id === killerId) return false
      return playerName(player) !== killerName
    })
    .map((player) => playerName(player))
    .filter((name) => name !== 'Unknown')

  const uniqueNames = Array.from(new Set(names)).slice(0, DISCORD_INLINE_FIELD_LIMIT)
  if (uniqueNames.length === 0) return null
  return truncateDiscord(uniqueNames.join(', '), 240)
}

function compactDescription(args: {
  event: AlbionKillbotEvent
  match: KillbotMatch
  homeGuild: string
  participants: string | null
}): string {
  const battleId = Number(args.event.BattleId)
  const battlePart = Number.isFinite(battleId) && battleId > 0
    ? `Battle ${Math.trunc(battleId)}`
    : `Event ${args.event.EventId}`
  const typePart = args.match.feedType === 'kill'
    ? `${args.homeGuild} kill${args.match.isJuicy ? ' · Juicy' : ''}`
    : `${args.homeGuild} death${args.match.isJuicy ? ' · Juicy' : ''}`
  return [
    `${typePart} · Fame ${formatFame(args.match.fame)} · ${battlePart}`,
    args.participants ? `Participants: ${args.participants}` : null,
  ]
    .filter((line): line is string => !!line)
    .join('\n')
}

export function buildKillbotDiscordPayload(
  event: AlbionKillbotEvent,
  match: KillbotMatch,
  config: KillbotConfig,
  target: KillbotTarget,
): DiscordPayload {
  const color = match.feedType === 'kill' ? 0x22c55e : 0xef4444
  const title = truncateDiscord(
    `${playerTitle(event.Killer, match.killerName)} ⚔ ${playerTitle(event.Victim, match.victimName)}`,
    DISCORD_TITLE_LIMIT,
  )
  const eventId = Number(event.EventId)
  const victimEquipment = equipmentEntries(event.Victim)
  const primaryItem = victimEquipment.find((entry) => entry.slot === 'MainHand') ?? victimEquipment[0]
  const eventUrl = killboardUrl(eventId)
  const homeGuild = target.homeGuildName || 'Home guild'
  const participants = participantSummary(event)

  return {
    content: config.mentionRoleId ? `<@&${config.mentionRoleId}>` : undefined,
    allowed_mentions: config.mentionRoleId
      ? { parse: [], roles: [config.mentionRoleId] }
      : { parse: [] },
    embeds: [
      {
        title,
        url: eventUrl,
        color,
        author: { name: `${homeGuild} Killbot` },
        timestamp: eventTimeOrNull(event) ?? undefined,
        thumbnail: primaryItem ? { url: itemImageUrl(primaryItem.itemId) } : undefined,
        description: compactDescription({ event, match, homeGuild, participants }),
        footer: { text: 'Powered by Albion Guild Manager · Killbot' },
      },
    ],
  }
}

function battleSummaryColor(summary: KillbotBattleSummary): number {
  if (summary.homeKills > summary.homeDeaths) return 0x22c55e
  if (summary.homeDeaths > summary.homeKills) return 0xef4444
  return 0xf59e0b
}

function formatBattlePlayerLine(
  line: KillbotBattlePlayerLine,
  fameKind: 'fame' | 'lost',
): string {
  const fame = fameKind === 'fame' ? line.killFame : line.deathFame
  return `${markdownLink(line.playerName, line.url)} ${line.kills}K / ${line.deaths}D · ${formatKillbotCompactFame(fame)} ${fameKind}`
}

function formatJuicyLine(line: KillbotBattleJuicyLine): string {
  return `${markdownLink(line.playerName, line.url)} ${formatKillbotCompactFame(line.fame)} fame`
}

function formatForceLine(line: KillbotBattleForceLine): string {
  return `${line.forceName} ${line.players}p · ${line.kills}K / ${line.deaths}D · ${formatKillbotCompactFame(line.killFame)} fame`
}

function fieldValue(lines: string[]): string | null {
  if (lines.length === 0) return null
  return truncateDiscord(lines.join('\n'), DISCORD_FIELD_VALUE_LIMIT)
}

function contentWithOptionalMentionLink(
  mentionRoleId: string | null,
  url: string,
): string | undefined {
  const parts = [
    mentionRoleId ? `<@&${mentionRoleId}>` : null,
    url.trim() || null,
  ].filter((part): part is string => !!part)
  return parts.length > 0 ? parts.join('\n') : undefined
}

export function buildKillbotBattleDiscordPayload(
  summary: KillbotBattleSummary,
  config: KillbotConfig,
  target: KillbotTarget,
): DiscordPayload {
  const fields = [
    {
      name: 'Forces',
      value: fieldValue(summary.forceLines.map(formatForceLine)),
    },
    {
      name: 'Top Kills',
      value: fieldValue(summary.topKills.map((line) => formatBattlePlayerLine(line, 'fame'))),
    },
    {
      name: 'Top Deaths',
      value: fieldValue(summary.topDeaths.map((line) => formatBattlePlayerLine(line, 'lost'))),
    },
    {
      name: 'Juicy Kills',
      value: fieldValue(summary.juicyKills.map(formatJuicyLine)),
    },
  ]
    .filter((field): field is { name: string; value: string } => !!field.value)
    .slice(0, DISCORD_INLINE_FIELD_LIMIT)

  const homeGuild = target.homeGuildName || 'Home guild'
  return {
    content: contentWithOptionalMentionLink(config.mentionRoleId, summary.detailUrl),
    allowed_mentions: config.mentionRoleId
      ? { parse: [], roles: [config.mentionRoleId] }
      : { parse: [] },
    embeds: [
      {
        title: truncateDiscord(summary.title, DISCORD_TITLE_LIMIT),
        url: summary.detailUrl,
        color: battleSummaryColor(summary),
        author: { name: `${homeGuild} Killbot` },
        timestamp: eventTimeOrNull({
          EventId: 0,
          TimeStamp: summary.startedAt,
        }) ?? undefined,
        thumbnail: undefined,
        image: undefined,
        description: truncateDiscord(summary.description, 512),
        fields,
        footer: { text: 'Powered by Albion Guild Manager · Killbot' },
      },
    ],
  }
}

function withKillbotCardImage(payload: DiscordPayload): DiscordPayload {
  const [firstEmbed, ...rest] = payload.embeds
  if (!firstEmbed) return payload
  return {
    ...payload,
    embeds: [
      {
        ...firstEmbed,
        thumbnail: undefined,
        image: { url: `attachment://${KILLBOT_CARD_FILENAME}` },
      },
      ...rest,
    ],
  }
}

export async function buildKillbotDiscordMessage(
  event: AlbionKillbotEvent,
  match: KillbotMatch,
  config: KillbotConfig,
  target: KillbotTarget,
  valueEstimate?: KillbotVictimValueEstimate | null,
): Promise<DiscordChannelMessage> {
  const payload = buildKillbotDiscordPayload(event, match, config, target)
  try {
    const card = await renderKillbotCardPng(event, match, target, valueEstimate)
    return {
      payload: withKillbotCardImage(payload),
      files: [
        {
          filename: KILLBOT_CARD_FILENAME,
          contentType: 'image/png',
          data: card,
        },
      ],
    }
  } catch {
    return { payload }
  }
}

export async function sendDiscordChannelMessage(
  channelId: string,
  message: DiscordPayload | DiscordChannelMessage,
): Promise<string> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) throw new Error('DISCORD_BOT_TOKEN is not configured')
  const normalized = 'payload' in message ? message : { payload: message }
  const hasFiles = !!normalized.files?.length
  const headers: HeadersInit = { Authorization: `Bot ${botToken}` }
  let body: BodyInit
  if (hasFiles) {
    const form = new FormData()
    form.append('payload_json', JSON.stringify(normalized.payload))
    normalized.files?.forEach((file, index) => {
      form.append(
        `files[${index}]`,
        new Blob([file.data as unknown as BlobPart], { type: file.contentType }),
        file.filename,
      )
    })
    body = form
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(normalized.payload)
  }

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers,
    body,
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Discord channel message failed (${res.status}): ${text.slice(0, 500)}`)
  }
  if (!text) return ''
  try {
    const data = JSON.parse(text) as { id?: string }
    return String(data.id ?? '')
  } catch {
    return ''
  }
}
