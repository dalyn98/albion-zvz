import { Buffer } from 'node:buffer'
import path from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import { EQUIPMENT_SLOTS, type EquipmentItem } from '@/lib/auto-regear-equipment'
import type { KillbotVictimValueEstimate } from '@/lib/killbot-value'
import type { AlbionKillbotEvent, KillbotMatch, KillbotTarget } from '@/lib/killbot'

const CARD_WIDTH = 920
const CARD_HEIGHT = 650
const SLOT_SIZE = 66
const SLOT_RADIUS = 12
const ICON_TIMEOUT_MS = 2500
const INVENTORY_COLS = 12
const INVENTORY_ROWS = 2
const INVENTORY_LIMIT = INVENTORY_COLS * INVENTORY_ROWS
const INVENTORY_SLOT_SIZE = 42
const INVENTORY_START_X = 158
const INVENTORY_START_Y = 546
const INVENTORY_GAP_X = 9
const INVENTORY_GAP_Y = 4
const CARD_FONT_FAMILY = 'Geist'
const CARD_FONT_FILE = path.join(
  process.cwd(),
  'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf',
)

const iconCache = new Map<string, Promise<string | null>>()

interface CardItem {
  itemId: string
  count: number
}

type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number]

interface TextLayer {
  x: number
  y: number
  value: string
  size: number
  weight?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  opacity?: number
  width?: number
}

const LEFT_EQUIPMENT_LAYOUT: Array<{ slot: EquipmentSlot; x: number; y: number }> = [
  { slot: 'Cape', x: 116, y: 318 },
  { slot: 'Head', x: 198, y: 318 },
  { slot: 'MainHand', x: 280, y: 318 },
  { slot: 'Potion', x: 116, y: 388 },
  { slot: 'Armor', x: 198, y: 388 },
  { slot: 'OffHand', x: 280, y: 388 },
  { slot: 'Food', x: 116, y: 458 },
  { slot: 'Shoes', x: 198, y: 458 },
  { slot: 'Mount', x: 280, y: 458 },
]

const RIGHT_EQUIPMENT_LAYOUT: Array<{ slot: EquipmentSlot; x: number; y: number }> = [
  { slot: 'MainHand', x: 558, y: 318 },
  { slot: 'Head', x: 640, y: 318 },
  { slot: 'Cape', x: 722, y: 318 },
  { slot: 'OffHand', x: 558, y: 388 },
  { slot: 'Armor', x: 640, y: 388 },
  { slot: 'Potion', x: 722, y: 388 },
  { slot: 'Mount', x: 558, y: 458 },
  { slot: 'Shoes', x: 640, y: 458 },
  { slot: 'Food', x: 722, y: 458 },
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

function formatNumber(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}

function formatCompactSilver(value: number): string {
  const n = Math.max(0, Math.floor(value))
  if (n >= 1_000_000_000) {
    const scaled = n / 1_000_000_000
    return `${scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)}B`
  }
  if (n >= 1_000_000) {
    const scaled = n / 1_000_000
    return `${scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)}M`
  }
  if (n >= 1_000) {
    const scaled = n / 1_000
    return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)}K`
  }
  return formatNumber(n)
}

function estimateValueLabel(valueEstimate: KillbotVictimValueEstimate | null | undefined): string {
  if (!valueEstimate || valueEstimate.totalItems === 0 || valueEstimate.totalSilver <= 0) {
    return '--'
  }
  return `${valueEstimate.isPartial ? '~' : ''}${formatCompactSilver(valueEstimate.totalSilver)}`
}

function estimateBreakdownLabel(
  valueEstimate: KillbotVictimValueEstimate | null | undefined,
): string {
  if (!valueEstimate || valueEstimate.totalItems === 0) return 'AODP estimate unavailable'
  const parts = [
    `Gear ${formatCompactSilver(valueEstimate.gearSilver)}`,
    `Bag ${formatCompactSilver(valueEstimate.inventorySilver)}`,
  ]
  if (valueEstimate.missingItems > 0) parts.push(`${valueEstimate.missingItems} missing`)
  return parts.join(' · ')
}

function pluralizeItems(count: number): string {
  return count === 1 ? '1 item' : `${count} items`
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

function victimInventoryCount(event: AlbionKillbotEvent): number {
  const rawInventory = event.Victim?.Inventory
  if (!Array.isArray(rawInventory)) return 0
  return rawInventory
    .map((item) => normalizeItem(item))
    .filter((item): item is CardItem => item !== null).length
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
  void args
  return ''
}

function textLayer(args: TextLayer): TextLayer {
  return args
}

function pangoEscape(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

function truncateCardText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function textLayerWidth(layer: TextLayer): number {
  if (layer.width) return layer.width
  if (layer.anchor === 'middle') return Math.max(40, Math.ceil(layer.value.length * layer.size * 0.68 + 24))
  if (layer.anchor === 'end') return 300
  return Math.max(40, Math.ceil(layer.value.length * layer.size * 0.68 + 16))
}

function textLayerLeft(layer: TextLayer, width: number): number {
  if (layer.anchor === 'middle') return Math.round(layer.x - width / 2)
  if (layer.anchor === 'end') return Math.round(layer.x - width)
  return Math.round(layer.x)
}

function textLayerAlign(layer: TextLayer): 'left' | 'center' | 'right' {
  if (layer.anchor === 'middle') return 'center'
  if (layer.anchor === 'end') return 'right'
  return 'left'
}

function textLayerTop(layer: TextLayer): number {
  return Math.max(0, Math.round(layer.y - layer.size * 1.05))
}

function textToComposite(layer: TextLayer): OverlayOptions | null {
  if (!layer.value || layer.opacity === 0) return null
  const width = textLayerWidth(layer)
  const fill = layer.fill ?? '#211c1c'
  return {
    input: {
      text: {
        text: `<span foreground="${fill}">${pangoEscape(layer.value)}</span>`,
        font: `${CARD_FONT_FAMILY} ${layer.size}`,
        fontfile: CARD_FONT_FILE,
        width,
        align: textLayerAlign(layer),
        rgba: true,
      },
    },
    left: textLayerLeft(layer, width),
    top: textLayerTop(layer),
  }
}

function renderEmptySlot(x: number, y: number, size = SLOT_SIZE): string {
  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${SLOT_RADIUS}" fill="#9c7452" opacity="0.30"/>
    <rect x="${x + 5}" y="${y + 5}" width="${size - 10}" height="${size - 10}" rx="${SLOT_RADIUS - 4}" fill="#d9b58f" opacity="0.20"/>
    <rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="${SLOT_RADIUS}" fill="none" stroke="#6f5038" stroke-width="2" opacity="0.24"/>
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
  const padding = size >= 60 ? 4 : 3
  const inner = size - padding * 2
  const item = args.item
  const icon = item ? args.icons.get(item.itemId) : null
  const clipId = `clip-${args.x}-${args.y}-${size}`
  const countBadge =
    item && item.count > 1
      ? `
        <rect x="${args.x + size - 31}" y="${args.y + size - 23}" width="28" height="20" rx="7" fill="#211912" opacity="0.94"/>
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
          <rect x="${args.x + padding}" y="${args.y + padding}" width="${inner}" height="${inner}" rx="${SLOT_RADIUS - 3}"/>
        </clipPath>
      </defs>
      <rect x="${args.x - 2}" y="${args.y - 2}" width="${size + 4}" height="${size + 4}" rx="${SLOT_RADIUS + 2}" fill="#2b211b" opacity="0.70"/>
      <rect x="${args.x}" y="${args.y}" width="${size}" height="${size}" rx="${SLOT_RADIUS}" fill="#5b3f2b"/>
      <image href="${escapeAttr(icon)}" x="${args.x + padding}" y="${args.y + padding}" width="${inner}" height="${inner}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid meet"/>
      <rect x="${args.x + 1.5}" y="${args.y + 1.5}" width="${size - 3}" height="${size - 3}" rx="${SLOT_RADIUS}" fill="none" stroke="#2a1d14" stroke-width="3" opacity="0.65"/>
      <rect x="${args.x + 4}" y="${args.y + 4}" width="${size - 8}" height="${size - 8}" rx="${SLOT_RADIUS - 3}" fill="none" stroke="#fff1c9" stroke-width="2.5" opacity="0.72"/>
      <rect x="${args.x + 0.5}" y="${args.y + 0.5}" width="${size - 1}" height="${size - 1}" rx="${SLOT_RADIUS}" fill="none" stroke="#f9d48c" stroke-width="1.5" opacity="0.52"/>
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

function itemSlotText(args: {
  x: number
  y: number
  item: CardItem | null | undefined
  icons: Map<string, string | null>
  size?: number
}): TextLayer[] {
  const size = args.size ?? SLOT_SIZE
  if (!args.item || args.item.count <= 1 || !args.icons.get(args.item.itemId)) return []
  return [
    textLayer({
      x: args.x + size - 16,
      y: args.y + size - 8,
      value: args.item.count > 99 ? '99+' : String(args.item.count),
      size: 11,
      weight: 800,
      fill: '#fff3df',
      anchor: 'middle',
      width: 30,
    }),
  ]
}

function equipmentTextLayers(args: {
  layout: Array<{ slot: EquipmentSlot; x: number; y: number }>
  equipment: Partial<Record<EquipmentSlot, CardItem>>
  icons: Map<string, string | null>
}): TextLayer[] {
  return args.layout.flatMap((entry) =>
    itemSlotText({
      x: entry.x,
      y: entry.y,
      item: args.equipment[entry.slot],
      icons: args.icons,
    }),
  )
}

function renderInventory(args: { items: CardItem[]; icons: Map<string, string | null> }): string {
  const slots: string[] = []
  for (let i = 0; i < INVENTORY_LIMIT; i += 1) {
    const col = i % INVENTORY_COLS
    const row = Math.floor(i / INVENTORY_COLS)
    slots.push(
      renderItemSlot({
        x: INVENTORY_START_X + col * (INVENTORY_SLOT_SIZE + INVENTORY_GAP_X),
        y: INVENTORY_START_Y + row * (INVENTORY_SLOT_SIZE + INVENTORY_GAP_Y),
        item: args.items[i],
        icons: args.icons,
        size: INVENTORY_SLOT_SIZE,
      }),
    )
  }
  return slots.join('')
}

function inventoryTextLayers(items: CardItem[], icons: Map<string, string | null>): TextLayer[] {
  const layers: TextLayer[] = []
  for (let i = 0; i < INVENTORY_LIMIT; i += 1) {
    const col = i % INVENTORY_COLS
    const row = Math.floor(i / INVENTORY_COLS)
    layers.push(
      ...itemSlotText({
        x: INVENTORY_START_X + col * (INVENTORY_SLOT_SIZE + INVENTORY_GAP_X),
        y: INVENTORY_START_Y + row * (INVENTORY_SLOT_SIZE + INVENTORY_GAP_Y),
        item: items[i],
        icons,
        size: INVENTORY_SLOT_SIZE,
      }),
    )
  }
  return layers
}

function buildTextLayers(args: {
  event: AlbionKillbotEvent
  match: KillbotMatch
  target: KillbotTarget
  leftEquipment: Partial<Record<EquipmentSlot, CardItem>>
  rightEquipment: Partial<Record<EquipmentSlot, CardItem>>
  inventory: CardItem[]
  icons: Map<string, string | null>
  valueEstimate?: KillbotVictimValueEstimate | null
}): TextLayer[] {
  const killerName = playerName(args.event.Killer)
  const victimName = playerName(args.event.Victim)
  const killerGuild = playerGuildLine(args.event.Killer)
  const victimGuild = playerGuildLine(args.event.Victim)
  const homeGuild = args.target.homeGuildName || 'Albion Guild Manager'
  const eventDate = formatEventDate(args.event.TimeStamp)
  const inventoryCount = victimInventoryCount(args.event)
  const battleId = Number(args.event.BattleId)
  const battleText = Number.isFinite(battleId) && battleId > 0
    ? `BATTLE #${Math.trunc(battleId)}`
    : `EVENT #${args.event.EventId}`
  const reportTitle = `${killerName} killed ${victimName}`
  const contextLine = [
    killerGuild ? `Killer ${killerGuild}` : null,
    victimGuild ? `Victim ${victimGuild}` : null,
  ]
    .filter((part): part is string => !!part)
    .join(' · ')
  const inventoryShown = Math.min(inventoryCount, INVENTORY_LIMIT)
  const inventoryLabel = inventoryCount > INVENTORY_LIMIT
    ? `${inventoryShown}/${inventoryCount} shown`
    : pluralizeItems(inventoryCount)

  return [
    textLayer({
      x: 70,
      y: 65,
      value: 'KILL REPORT',
      size: 14,
      weight: 900,
      fill: '#8de8ad',
      width: 180,
    }),
    textLayer({
      x: 70,
      y: 100,
      value: truncateCardText(reportTitle, 50),
      size: 29,
      weight: 900,
      fill: '#f7f4ef',
      width: 650,
    }),
    textLayer({
      x: 70,
      y: 128,
      value: truncateCardText(contextLine || homeGuild, 74),
      size: 15,
      weight: 700,
      fill: '#c5c6d2',
      width: 720,
    }),
    textLayer({
      x: 850,
      y: 75,
      value: battleText,
      size: 13,
      weight: 900,
      fill: '#c5c6d2',
      anchor: 'end',
      width: 210,
    }),
    textLayer({
      x: 850,
      y: 103,
      value: eventDate,
      size: 13,
      weight: 800,
      fill: '#9b9dab',
      anchor: 'end',
      width: 220,
    }),
    textLayer({
      x: 82,
      y: 187,
      value: 'ESTIMATED LOSS',
      size: 13,
      weight: 900,
      fill: '#69503b',
      width: 220,
    }),
    textLayer({
      x: 82,
      y: 219,
      value: estimateValueLabel(args.valueEstimate),
      size: 30,
      weight: 900,
      fill: '#2c211a',
      width: 220,
    }),
    textLayer({
      x: 82,
      y: 244,
      value: truncateCardText(estimateBreakdownLabel(args.valueEstimate), 34),
      size: 13,
      weight: 700,
      fill: '#77553c',
      width: 245,
    }),
    textLayer({
      x: 364,
      y: 187,
      value: 'DEATH FAME',
      size: 13,
      weight: 900,
      fill: '#69503b',
      width: 220,
    }),
    textLayer({
      x: 364,
      y: 219,
      value: formatNumber(args.match.fame),
      size: 30,
      weight: 900,
      fill: '#2c211a',
      width: 220,
    }),
    textLayer({
      x: 364,
      y: 244,
      value: args.match.isJuicy ? 'Juicy kill threshold met' : 'Kill fame from victim',
      size: 13,
      weight: 700,
      fill: '#77553c',
      width: 245,
    }),
    textLayer({
      x: 646,
      y: 187,
      value: 'VICTIM INVENTORY',
      size: 13,
      weight: 900,
      fill: '#69503b',
      width: 220,
    }),
    textLayer({
      x: 646,
      y: 219,
      value: inventoryLabel,
      size: 30,
      weight: 900,
      fill: '#2c211a',
      width: 220,
    }),
    textLayer({
      x: 646,
      y: 244,
      value: `Inventory value ${formatCompactSilver(args.valueEstimate?.inventorySilver ?? 0)}`,
      size: 13,
      weight: 700,
      fill: '#77553c',
      width: 245,
    }),
    textLayer({
      x: 72,
      y: 290,
      value: 'KILLER LOADOUT',
      size: 15,
      weight: 900,
      fill: '#2b6441',
      width: 250,
    }),
    textLayer({
      x: 72,
      y: 312,
      value: truncateCardText(killerName, 24),
      size: 18,
      weight: 900,
      fill: '#2b2321',
      width: 250,
    }),
    textLayer({
      x: 510,
      y: 290,
      value: 'VICTIM LOST GEAR',
      size: 15,
      weight: 900,
      fill: '#8d3d34',
      width: 250,
    }),
    textLayer({
      x: 510,
      y: 312,
      value: truncateCardText(victimName, 24),
      size: 18,
      weight: 900,
      fill: '#2b2321',
      width: 250,
    }),
    ...equipmentTextLayers({
      layout: LEFT_EQUIPMENT_LAYOUT,
      equipment: args.leftEquipment,
      icons: args.icons,
    }),
    ...equipmentTextLayers({
      layout: RIGHT_EQUIPMENT_LAYOUT,
      equipment: args.rightEquipment,
      icons: args.icons,
    }),
    ...inventoryTextLayers(args.inventory, args.icons),
  ]
}

function buildSvg(args: {
  event: AlbionKillbotEvent
  match: KillbotMatch
  leftEquipment: Partial<Record<EquipmentSlot, CardItem>>
  rightEquipment: Partial<Record<EquipmentSlot, CardItem>>
  inventory: CardItem[]
  icons: Map<string, string | null>
}): string {
  const accent = args.match.feedType === 'kill' ? '#26d07c' : '#ef5b5b'

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
      <defs>
        <filter id="cardShadow" x="-8%" y="-8%" width="116%" height="116%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#090b10" flood-opacity="0.42"/>
        </filter>
        <filter id="slotShadow" x="-18%" y="-18%" width="136%" height="136%">
          <feDropShadow dx="0" dy="4" stdDeviation="3.4" flood-color="#170f0a" flood-opacity="0.60"/>
        </filter>
        <linearGradient id="cardBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#e0c09a"/>
          <stop offset="52%" stop-color="#d3ad84"/>
          <stop offset="100%" stop-color="#bd8f67"/>
        </linearGradient>
        <linearGradient id="headerBg" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#242833"/>
          <stop offset="100%" stop-color="#1b1f2a"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="34" fill="#141821"/>
      <rect x="18" y="18" width="${CARD_WIDTH - 36}" height="${CARD_HEIGHT - 36}" rx="30" fill="url(#cardBg)" filter="url(#cardShadow)"/>
      <rect x="36" y="36" width="${CARD_WIDTH - 72}" height="118" rx="24" fill="url(#headerBg)"/>
      <rect x="36" y="36" width="8" height="118" rx="4" fill="${accent}"/>
      <rect x="52" y="52" width="3" height="72" rx="2" fill="${accent}" opacity="0.5"/>

      <rect x="60" y="166" width="245" height="86" rx="18" fill="#f4ddb7" opacity="0.84"/>
      <rect x="342" y="166" width="245" height="86" rx="18" fill="#f4ddb7" opacity="0.84"/>
      <rect x="624" y="166" width="245" height="86" rx="18" fill="#f4ddb7" opacity="0.84"/>
      <rect x="60" y="166" width="245" height="86" rx="18" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.22"/>
      <rect x="342" y="166" width="245" height="86" rx="18" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.22"/>
      <rect x="624" y="166" width="245" height="86" rx="18" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.22"/>

      <rect x="42" y="266" width="396" height="266" rx="22" fill="#e3bf95" opacity="0.88"/>
      <rect x="42" y="266" width="6" height="266" rx="3" fill="#28c76f"/>
      <rect x="482" y="266" width="396" height="266" rx="22" fill="#e3bf95" opacity="0.88"/>
      <rect x="872" y="266" width="6" height="266" rx="3" fill="#e5574f"/>
      <rect x="42" y="266" width="396" height="266" rx="22" fill="none" stroke="#fff0cf" stroke-width="1.5" opacity="0.52"/>
      <rect x="482" y="266" width="396" height="266" rx="22" fill="none" stroke="#fff0cf" stroke-width="1.5" opacity="0.52"/>

      ${renderEquipmentGroup({ layout: LEFT_EQUIPMENT_LAYOUT, equipment: args.leftEquipment, icons: args.icons })}
      ${renderEquipmentGroup({ layout: RIGHT_EQUIPMENT_LAYOUT, equipment: args.rightEquipment, icons: args.icons })}

      <rect x="42" y="532" width="836" height="104" rx="20" fill="#e8c79f" opacity="0.90"/>
      ${renderInventory({ items: args.inventory, icons: args.icons })}
    </svg>
  `
}

export async function renderKillbotCardPng(
  event: AlbionKillbotEvent,
  match: KillbotMatch,
  target: KillbotTarget,
  valueEstimate?: KillbotVictimValueEstimate | null,
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
    leftEquipment,
    rightEquipment,
    inventory,
    icons,
  })
  const textComposites = buildTextLayers({
    event,
    match,
    target,
    leftEquipment,
    rightEquipment,
    inventory,
    icons,
    valueEstimate,
  })
    .map(textToComposite)
    .filter((overlay): overlay is OverlayOptions => overlay !== null)
  const base = sharp(Buffer.from(svg))
  return (textComposites.length > 0 ? base.composite(textComposites) : base).png().toBuffer()
}
