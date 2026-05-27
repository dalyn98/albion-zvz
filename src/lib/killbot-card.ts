import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { EQUIPMENT_SLOTS, type EquipmentItem } from '@/lib/auto-regear-equipment'
import type { AlbionKillbotEvent, KillbotMatch, KillbotTarget } from '@/lib/killbot'

const CARD_WIDTH = 920
const CARD_HEIGHT = 650
const SLOT_SIZE = 74
const SLOT_RADIUS = 12
const ICON_TIMEOUT_MS = 2500
const INVENTORY_COLS = 9
const INVENTORY_ROWS = 3
const INVENTORY_LIMIT = INVENTORY_COLS * INVENTORY_ROWS

const iconCache = new Map<string, Promise<string | null>>()

interface CardItem {
  itemId: string
  count: number
}

type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number]

const LEFT_EQUIPMENT_LAYOUT: Array<{ slot: EquipmentSlot; x: number; y: number }> = [
  { slot: 'MainHand', x: 70, y: 108 },
  { slot: 'Head', x: 158, y: 108 },
  { slot: 'Cape', x: 246, y: 108 },
  { slot: 'OffHand', x: 70, y: 198 },
  { slot: 'Armor', x: 158, y: 198 },
  { slot: 'Potion', x: 246, y: 198 },
  { slot: 'Mount', x: 70, y: 288 },
  { slot: 'Shoes', x: 158, y: 288 },
  { slot: 'Food', x: 246, y: 288 },
]

const RIGHT_EQUIPMENT_LAYOUT: Array<{ slot: EquipmentSlot; x: number; y: number }> = [
  { slot: 'Cape', x: 604, y: 108 },
  { slot: 'Head', x: 692, y: 108 },
  { slot: 'MainHand', x: 780, y: 108 },
  { slot: 'Potion', x: 604, y: 198 },
  { slot: 'Armor', x: 692, y: 198 },
  { slot: 'OffHand', x: 780, y: 198 },
  { slot: 'Food', x: 604, y: 288 },
  { slot: 'Shoes', x: 692, y: 288 },
  { slot: 'Mount', x: 780, y: 288 },
]

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

function playerName(player: AlbionKillbotEvent['Killer'] | undefined | null): string {
  return String(player?.Name ?? '').trim() || 'Unknown'
}

function playerGuildLine(player: AlbionKillbotEvent['Killer'] | undefined | null): string {
  const guild = String(player?.GuildName ?? '').trim()
  const alliance = String(player?.AllianceName ?? '').trim()
  if (guild && alliance) return `[${guild}] ${alliance}`
  if (guild) return `[${guild}]`
  if (alliance) return alliance
  return ''
}

function playerIp(player: AlbionKillbotEvent['Killer'] | undefined | null): string {
  const ip = Number(player?.AverageItemPower)
  if (!Number.isFinite(ip) || ip <= 0) return ''
  return Math.round(ip).toLocaleString('en-US')
}

function formatNumber(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}

function formatEventDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = months[date.getUTCMonth()] ?? ''
  const year = date.getUTCFullYear()
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hour}:${minute} ${day} ${month} ${year}`
}

function normalizeItem(raw: EquipmentItem | null | undefined): CardItem | null {
  const itemId = typeof raw?.Type === 'string' ? raw.Type.trim() : ''
  if (!itemId) return null
  const count = Number(raw?.Count)
  return {
    itemId,
    count: Number.isFinite(count) && count > 1 ? Math.floor(count) : 1,
  }
}

function equipmentBySlot(
  player: AlbionKillbotEvent['Killer'] | undefined | null,
): Partial<Record<EquipmentSlot, CardItem>> {
  const equipment = player?.Equipment
  if (!equipment) return {}
  return EQUIPMENT_SLOTS.reduce<Partial<Record<EquipmentSlot, CardItem>>>((acc, slot) => {
    const item = normalizeItem(equipment[slot])
    return item ? { ...acc, [slot]: item } : acc
  }, {})
}

function inventoryItems(event: AlbionKillbotEvent): CardItem[] {
  const rawInventory = event.Victim?.Inventory
  if (!Array.isArray(rawInventory)) return []
  return rawInventory
    .map((item) => normalizeItem(item))
    .filter((item): item is CardItem => item !== null)
    .slice(0, INVENTORY_LIMIT)
}

function itemImageUrl(itemId: string): string {
  return `https://render.albiononline.com/v1/item/${encodeURIComponent(itemId)}.png?size=128`
}

async function fetchIconDataUri(itemId: string): Promise<string | null> {
  const cached = iconCache.get(itemId)
  if (cached) return cached

  const promise = (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ICON_TIMEOUT_MS)
    try {
      const res = await fetch(itemImageUrl(itemId), {
        cache: 'force-cache',
        signal: controller.signal,
      })
      if (!res.ok) return null
      const contentType = res.headers.get('content-type')?.split(';')[0] || 'image/png'
      const data = Buffer.from(await res.arrayBuffer()).toString('base64')
      return `data:${contentType};base64,${data}`
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  })()

  iconCache.set(itemId, promise)
  return promise
}

async function loadIcons(items: CardItem[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(items.map((item) => item.itemId)))
  const entries = await Promise.all(ids.map(async (id) => [id, await fetchIconDataUri(id)] as const))
  return new Map(entries)
}

function renderText(args: {
  x: number
  y: number
  value: string
  size: number
  weight?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  opacity?: number
}): string {
  const anchor = args.anchor ?? 'start'
  const weight = args.weight ?? 600
  const fill = args.fill ?? '#211c1c'
  const opacity = args.opacity ?? 1
  return `<text x="${args.x}" y="${args.y}" text-anchor="${anchor}" font-size="${args.size}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${escapeText(args.value)}</text>`
}

function renderEmptySlot(x: number, y: number, size = SLOT_SIZE): string {
  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${SLOT_RADIUS}" fill="#c09b79" opacity="0.45"/>
    <rect x="${x + 6}" y="${y + 6}" width="${size - 12}" height="${size - 12}" rx="${SLOT_RADIUS - 4}" fill="#d8bc9d" opacity="0.35"/>
  `
}

function renderItemSlot(args: {
  x: number
  y: number
  item: CardItem | null | undefined
  icons: Map<string, string | null>
  size?: number
}): string {
  const size = args.size ?? SLOT_SIZE
  const inner = size - 10
  const item = args.item
  const icon = item ? args.icons.get(item.itemId) : null
  const clipId = `clip-${args.x}-${args.y}-${size}`
  const countBadge =
    item && item.count > 1
      ? `
        <rect x="${args.x + size - 29}" y="${args.y + size - 22}" width="26" height="18" rx="7" fill="#473322" opacity="0.88"/>
        ${renderText({
          x: args.x + size - 16,
          y: args.y + size - 8,
          value: item.count > 99 ? '99+' : String(item.count),
          size: 11,
          weight: 800,
          fill: '#fff3df',
          anchor: 'middle',
        })}
      `
      : ''

  if (!icon) {
    return `
      <g filter="url(#slotShadow)">
        ${renderEmptySlot(args.x, args.y, size)}
      </g>
    `
  }

  return `
    <g filter="url(#slotShadow)">
      <defs>
        <clipPath id="${clipId}">
          <rect x="${args.x + 5}" y="${args.y + 5}" width="${inner}" height="${inner}" rx="${SLOT_RADIUS - 3}"/>
        </clipPath>
      </defs>
      <rect x="${args.x}" y="${args.y}" width="${size}" height="${size}" rx="${SLOT_RADIUS}" fill="#8b765f"/>
      <image href="${escapeAttr(icon)}" x="${args.x + 5}" y="${args.y + 5}" width="${inner}" height="${inner}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid meet"/>
      <rect x="${args.x + 1.5}" y="${args.y + 1.5}" width="${size - 3}" height="${size - 3}" rx="${SLOT_RADIUS}" fill="none" stroke="#7c5a3c" stroke-width="3" opacity="0.55"/>
      <rect x="${args.x + 5}" y="${args.y + 5}" width="${inner}" height="${inner}" rx="${SLOT_RADIUS - 3}" fill="none" stroke="#f4dfb9" stroke-width="2" opacity="0.38"/>
      ${countBadge}
    </g>
  `
}

function renderEquipmentGroup(args: {
  layout: Array<{ slot: EquipmentSlot; x: number; y: number }>
  equipment: Partial<Record<EquipmentSlot, CardItem>>
  icons: Map<string, string | null>
}): string {
  return args.layout
    .map((entry) =>
      renderItemSlot({
        x: entry.x,
        y: entry.y,
        item: args.equipment[entry.slot],
        icons: args.icons,
      }),
    )
    .join('')
}

function renderInventory(args: { items: CardItem[]; icons: Map<string, string | null> }): string {
  const startX = 70
  const startY = 442
  const size = 62
  const gap = 16
  const slots: string[] = []
  for (let i = 0; i < INVENTORY_LIMIT; i += 1) {
    const col = i % INVENTORY_COLS
    const row = Math.floor(i / INVENTORY_COLS)
    slots.push(
      renderItemSlot({
        x: startX + col * (size + gap),
        y: startY + row * (size + 14),
        item: args.items[i],
        icons: args.icons,
        size,
      }),
    )
  }
  return slots.join('')
}

function renderPlayerHeader(args: {
  x: number
  y: number
  name: string
  guildLine: string
  ip: string
  anchor: 'start' | 'end'
}): string {
  const ipText = args.ip ? `IP ${args.ip}` : ''
  return `
    ${renderText({ x: args.x, y: args.y, value: args.name, size: 25, weight: 800, anchor: args.anchor })}
    ${renderText({
      x: args.x,
      y: args.y + 26,
      value: args.guildLine,
      size: 16,
      weight: 700,
      fill: '#5f4631',
      anchor: args.anchor,
    })}
    ${renderText({
      x: args.x,
      y: args.y + 48,
      value: ipText,
      size: 14,
      weight: 800,
      fill: '#876143',
      anchor: args.anchor,
      opacity: ipText ? 1 : 0,
    })}
  `
}

function buildSvg(args: {
  event: AlbionKillbotEvent
  match: KillbotMatch
  target: KillbotTarget
  leftEquipment: Partial<Record<EquipmentSlot, CardItem>>
  rightEquipment: Partial<Record<EquipmentSlot, CardItem>>
  inventory: CardItem[]
  icons: Map<string, string | null>
}): string {
  const killerName = playerName(args.event.Killer)
  const victimName = playerName(args.event.Victim)
  const killerGuild = playerGuildLine(args.event.Killer)
  const victimGuild = playerGuildLine(args.event.Victim)
  const killerIp = playerIp(args.event.Killer)
  const victimIp = playerIp(args.event.Victim)
  const homeGuild = args.target.homeGuildName || 'Albion Guild Manager'
  const eventDate = formatEventDate(args.event.TimeStamp)
  const battleId = Number(args.event.BattleId)
  const battleText = Number.isFinite(battleId) && battleId > 0 ? `BATTLE #${Math.trunc(battleId)}` : `EVENT #${args.event.EventId}`

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
      <defs>
        <filter id="cardShadow" x="-8%" y="-8%" width="116%" height="116%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#5b3a23" flood-opacity="0.28"/>
        </filter>
        <filter id="slotShadow" x="-18%" y="-18%" width="136%" height="136%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#4a2f1e" flood-opacity="0.35"/>
        </filter>
        <linearGradient id="cardBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#dabb98"/>
          <stop offset="50%" stop-color="#d2ad88"/>
          <stop offset="100%" stop-color="#c99f78"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="34" fill="#1f2028"/>
      <rect x="18" y="18" width="${CARD_WIDTH - 36}" height="${CARD_HEIGHT - 36}" rx="30" fill="url(#cardBg)" filter="url(#cardShadow)"/>
      <rect x="34" y="34" width="${CARD_WIDTH - 68}" height="${CARD_HEIGHT - 68}" rx="24" fill="none" stroke="#ead0ad" stroke-width="2" opacity="0.35"/>

      ${renderPlayerHeader({ x: 70, y: 64, name: killerName, guildLine: killerGuild, ip: killerIp, anchor: 'start' })}
      ${renderPlayerHeader({ x: 850, y: 64, name: victimName, guildLine: victimGuild, ip: victimIp, anchor: 'end' })}

      ${renderText({ x: 460, y: 80, value: battleText, size: 13, weight: 900, fill: '#7a563a', anchor: 'middle' })}
      ${renderText({ x: 460, y: 132, value: formatNumber(args.match.fame), size: 24, weight: 900, fill: '#2b2321', anchor: 'middle' })}
      ${renderText({ x: 460, y: 154, value: 'KILL FAME', size: 13, weight: 900, fill: '#7a563a', anchor: 'middle' })}
      <circle cx="460" cy="230" r="45" fill="#4d403a" opacity="0.95"/>
      <circle cx="460" cy="230" r="35" fill="#2d2b34" stroke="#b4936f" stroke-width="4"/>
      ${renderText({ x: 460, y: 226, value: args.match.feedType === 'kill' ? 'KILL' : 'DEATH', size: 18, weight: 900, fill: '#f6dfbd', anchor: 'middle' })}
      ${renderText({ x: 460, y: 250, value: homeGuild, size: 11, weight: 800, fill: '#d7b789', anchor: 'middle' })}
      ${renderText({ x: 460, y: 322, value: eventDate, size: 15, weight: 800, fill: '#5c4432', anchor: 'middle' })}

      ${renderEquipmentGroup({ layout: LEFT_EQUIPMENT_LAYOUT, equipment: args.leftEquipment, icons: args.icons })}
      ${renderEquipmentGroup({ layout: RIGHT_EQUIPMENT_LAYOUT, equipment: args.rightEquipment, icons: args.icons })}

      ${renderText({ x: 460, y: 412, value: "VICTIM'S INVENTORY", size: 16, weight: 900, fill: '#513b2a', anchor: 'middle' })}
      <rect x="60" y="425" width="800" height="1.5" rx="1" fill="#8f6748" opacity="0.28"/>
      ${renderInventory({ items: args.inventory, icons: args.icons })}
    </svg>
  `
}

export async function renderKillbotCardPng(
  event: AlbionKillbotEvent,
  match: KillbotMatch,
  target: KillbotTarget,
): Promise<Buffer> {
  const leftEquipment = equipmentBySlot(event.Killer)
  const rightEquipment = equipmentBySlot(event.Victim)
  const inventory = inventoryItems(event)
  const allItems = [
    ...Object.values(leftEquipment),
    ...Object.values(rightEquipment),
    ...inventory,
  ].filter((item): item is CardItem => item !== undefined)
  const icons = await loadIcons(allItems)
  const svg = buildSvg({
    event,
    match,
    target,
    leftEquipment,
    rightEquipment,
    inventory,
    icons,
  })
  return sharp(Buffer.from(svg)).png().toBuffer()
}
