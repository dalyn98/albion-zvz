import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import { EQUIPMENT_SLOTS, type EquipmentItem } from '@/lib/auto-regear-equipment'
import type { KillbotVictimValueEstimate } from '@/lib/killbot-value'
import type { AlbionKillbotEvent, KillbotMatch, KillbotTarget } from '@/lib/killbot'

const CARD_WIDTH = 1200
const CARD_HEIGHT = 800
const SLOT_SIZE = 100
const SLOT_RADIUS = 12
const ICON_TIMEOUT_MS = 6000
const ICON_FETCH_ATTEMPTS = 2
const ICON_FETCH_CONCURRENCY = 6
const INVENTORY_COLS = 12
const INVENTORY_ROWS = 1
const INVENTORY_LIMIT = INVENTORY_COLS * INVENTORY_ROWS
const INVENTORY_SLOT_SIZE = 68
const INVENTORY_START_X = 115
const INVENTORY_START_Y = 665
const INVENTORY_GAP_X = 14
const INVENTORY_GAP_Y = 0
const CARD_FONT_FAMILY = 'Geist'
export const KILLBOT_CARD_FONT_FILE = path.join(
  process.cwd(),
  'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf',
)

export const KILLBOT_CENTER_ICON_ASSETS = {
  fame: {
    filePath: path.join(process.cwd(), 'public/killbot/wiki-this-is-albion-icon.png'),
    sourceUrl: 'https://wiki.albiononline.com/wiki/File:This._Is._Albion!_Icon.png',
  },
  silver: {
    filePath: path.join(process.cwd(), 'public/killbot/wiki-silvercoins.png'),
    sourceUrl: 'https://wiki.albiononline.com/wiki/File:SilverCoins.png',
  },
  kill: {
    filePath: path.join(process.cwd(), 'public/killbot/wiki-monster-kill-icon.png'),
    sourceUrl: 'https://wiki.albiononline.com/wiki/File:M-m-m-monster_Kill!_Icon.png',
  },
} as const

export const KILLBOT_CENTER_LAYOUT = {
  metrics: {
    fame: {
      iconCenterX: 538,
      iconCenterY: 134,
      iconSize: 52,
      valueX: 580,
      valueY: 154,
      valueWidth: 178,
      valueAnchor: 'start',
    },
    silver: {
      iconCenterX: 538,
      iconCenterY: 244,
      iconSize: 56,
      valueX: 580,
      valueY: 264,
      valueWidth: 178,
      valueAnchor: 'start',
    },
  },
  kill: {
    cx: 600,
    cy: 382,
    radius: 58,
    iconSize: 116,
    source: 'official-monster-kill',
  },
  roles: {
    killer: {
      label: 'KILLER',
      markerStyle: 'underline',
      labelX: 216,
      labelY: 38,
      labelSize: 16,
      nameX: 216,
      nameY: 72,
      guildX: 216,
      guildY: 108,
      underlineX: 142,
      underlineY: 118,
      underlineWidth: 148,
      color: '#25945c',
    },
    victim: {
      label: 'VICTIM',
      markerStyle: 'underline',
      labelX: 986,
      labelY: 38,
      labelSize: 16,
      nameX: 986,
      nameY: 72,
      guildX: 986,
      guildY: 108,
      underlineX: 912,
      underlineY: 118,
      underlineWidth: 148,
      color: '#bf3f3a',
    },
  },
} as const

const iconCache = new Map<string, Promise<string | null>>()
const centerIconCache = new Map<CenterIconKey, Promise<string | null>>()

interface CardItem {
  itemId: string
  count: number
}

type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number]
type CenterIconKey = keyof typeof KILLBOT_CENTER_ICON_ASSETS

type CenterIcons = Record<CenterIconKey, string | null>

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
  { slot: 'Bag', x: 42, y: 122 },
  { slot: 'Head', x: 174, y: 122 },
  { slot: 'Cape', x: 306, y: 122 },
  { slot: 'MainHand', x: 42, y: 244 },
  { slot: 'Armor', x: 174, y: 244 },
  { slot: 'OffHand', x: 306, y: 244 },
  { slot: 'Potion', x: 42, y: 366 },
  { slot: 'Shoes', x: 174, y: 366 },
  { slot: 'Food', x: 306, y: 366 },
  { slot: 'Mount', x: 174, y: 488 },
]

const RIGHT_EQUIPMENT_LAYOUT: Array<{ slot: EquipmentSlot; x: number; y: number }> = [
  { slot: 'Bag', x: 794, y: 122 },
  { slot: 'Head', x: 926, y: 122 },
  { slot: 'Cape', x: 1058, y: 122 },
  { slot: 'MainHand', x: 794, y: 244 },
  { slot: 'Armor', x: 926, y: 244 },
  { slot: 'OffHand', x: 1058, y: 244 },
  { slot: 'Potion', x: 794, y: 366 },
  { slot: 'Shoes', x: 926, y: 366 },
  { slot: 'Food', x: 1058, y: 366 },
  { slot: 'Mount', x: 926, y: 488 },
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

function averageItemPowerLabel(
  player: AlbionKillbotEvent['Killer'] | undefined | null,
): string | null {
  const itemPower = Number(player?.AverageItemPower)
  if (!Number.isFinite(itemPower) || itemPower <= 0) return null
  return `IP: ${formatNumber(Math.round(itemPower))}`
}

function compactStatLine(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => !!part).join('  ')
}

function isRenderableItemId(itemId: string): boolean {
  const baseItemId = itemId.replace(/@\d+$/, '')
  if (/^T\d+$/i.test(baseItemId)) return false
  return baseItemId.includes('_')
}

function normalizeItem(raw: EquipmentItem | null | undefined): CardItem | null {
  const itemId = typeof raw?.Type === 'string' ? raw.Type.trim() : ''
  if (!itemId) return null
  if (!isRenderableItemId(itemId)) return null
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

function iconItemIdCandidates(itemId: string): string[] {
  const trimmed = itemId.trim()
  if (!trimmed) return []
  const base = trimmed.replace(/@\d+$/, '')
  return base === trimmed ? [trimmed] : [trimmed, base]
}

async function fetchIconCandidateDataUri(itemId: string): Promise<string | null> {
  for (let attempt = 1; attempt <= ICON_FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ICON_TIMEOUT_MS)
    try {
      const res = await fetch(itemImageUrl(itemId), {
        cache: 'force-cache',
        signal: controller.signal,
      })
      if (!res.ok) continue
      const contentType = res.headers.get('content-type')?.split(';')[0] || 'image/png'
      const data = Buffer.from(await res.arrayBuffer()).toString('base64')
      if (!data) continue
      return `data:${contentType};base64,${data}`
    } catch {
      continue
    } finally {
      clearTimeout(timeout)
    }
  }
  return null
}

async function fetchIconDataUri(itemId: string): Promise<string | null> {
  const cached = iconCache.get(itemId)
  if (cached) return cached

  const promise = (async () => {
    for (const candidate of iconItemIdCandidates(itemId)) {
      const icon = await fetchIconCandidateDataUri(candidate)
      if (icon) return icon
    }
    return null
  })()

  iconCache.set(itemId, promise)
  promise.then((icon) => {
    if (!icon) iconCache.delete(itemId)
  }, () => {
    iconCache.delete(itemId)
  })
  return promise
}

async function readCenterIconDataUri(key: CenterIconKey): Promise<string | null> {
  const cached = centerIconCache.get(key)
  if (cached) return cached

  const promise = readFile(KILLBOT_CENTER_ICON_ASSETS[key].filePath)
    .then((data) => `data:image/png;base64,${data.toString('base64')}`)
    .catch(() => null)

  centerIconCache.set(key, promise)
  promise.then((icon) => {
    if (!icon) centerIconCache.delete(key)
  }, () => {
    centerIconCache.delete(key)
  })
  return promise
}

async function loadCenterIcons(): Promise<CenterIcons> {
  const [fame, silver, kill] = await Promise.all([
    readCenterIconDataUri('fame'),
    readCenterIconDataUri('silver'),
    readCenterIconDataUri('kill'),
  ])
  return { fame, silver, kill }
}

async function loadIcons(items: CardItem[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(items.map((item) => item.itemId)))
  const icons = new Map<string, string | null>()
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(ICON_FETCH_CONCURRENCY, ids.length) },
    async () => {
      while (nextIndex < ids.length) {
        const id = ids[nextIndex]
        nextIndex += 1
        icons.set(id, await fetchIconDataUri(id))
      }
    },
  )
  await Promise.all(workers)
  return icons
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
  return Math.max(24, Math.ceil(layer.value.length * layer.size * 0.58 + 8))
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
        text: `<span foreground="${fill}" weight="${layer.weight ?? 400}">${pangoEscape(layer.value)}</span>`,
        font: `${CARD_FONT_FAMILY} ${layer.size}`,
        fontfile: KILLBOT_CARD_FONT_FILE,
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
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${SLOT_RADIUS}" fill="#795b42" opacity="0.13"/>
    <rect x="${x + 6}" y="${y + 6}" width="${size - 12}" height="${size - 12}" rx="${SLOT_RADIUS - 4}" fill="#ead0ae" opacity="0.08"/>
    <rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="${SLOT_RADIUS}" fill="none" stroke="#6f5038" stroke-width="1.5" opacity="0.10"/>
  `
}

function countBadgeMetrics(x: number, y: number, size: number): {
  compact: boolean
  x: number
  y: number
  width: number
  height: number
  radius: number
  textX: number
  textY: number
  textSize: number
  textAnchor: 'middle' | 'end'
  textWidth: number
} {
  const compact = size < 50
  const width = compact ? 0 : 28
  const height = compact ? 0 : 20
  const margin = size >= 80 ? 10 : 5
  const badgeX = x + size - width - margin
  const badgeY = y + size - height - margin
  return {
    compact,
    x: badgeX,
    y: badgeY,
    width,
    height,
    radius: compact ? 6 : 7,
    textX: compact ? x + size - 4 : badgeX + width / 2,
    textY: compact ? y + size - 4 : badgeY + height - 5,
    textSize: compact ? 10 : 11,
    textAnchor: compact ? 'end' : 'middle',
    textWidth: compact ? 34 : width,
  }
}

function itemCountLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

function renderItemSlot(args: {
  x: number
  y: number
  item: CardItem | null | undefined
  icons: Map<string, string | null>
  size?: number
}): string {
  const size = args.size ?? SLOT_SIZE
  const item = args.item
  const icon = item ? args.icons.get(item.itemId) : null
  const badge = countBadgeMetrics(args.x, args.y, size)
  const countBadge =
    item && item.count > 1 && !badge.compact
      ? `
        <rect x="${badge.x}" y="${badge.y}" width="${badge.width}" height="${badge.height}" rx="${badge.radius}" fill="#211912" opacity="0.94"/>
        ${renderText({
          x: badge.textX,
          y: badge.textY,
          value: itemCountLabel(item.count),
          size: badge.textSize,
          weight: 800,
          fill: '#fff3df',
          anchor: badge.textAnchor,
        })}
      `
      : ''

  if (!item) {
    return `
      <g>
        ${renderEmptySlot(args.x, args.y, size)}
      </g>
    `
  }

  if (!icon) {
    return `
      <g>
        ${renderEmptySlot(args.x, args.y, size)}
      </g>
    `
  }

  return `
    <g filter="url(#slotShadow)">
      <image href="${escapeAttr(icon)}" x="${args.x}" y="${args.y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>
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
  if (!args.item) return []
  const badge = countBadgeMetrics(args.x, args.y, size)
  if (!args.icons.get(args.item.itemId)) return []
  if (args.item.count <= 1) return []
  const value = itemCountLabel(args.item.count)
  const baseLayer = {
    value,
    size: badge.textSize,
    weight: 900,
    anchor: badge.textAnchor,
    width: badge.textWidth,
  } satisfies Pick<TextLayer, 'value' | 'size' | 'weight' | 'anchor' | 'width'>

  if (badge.compact) {
    return [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [0, 1],
    ].map(([dx, dy]) =>
      textLayer({
        ...baseLayer,
        x: badge.textX + dx,
        y: badge.textY + dy,
        fill: '#1b120c',
        opacity: 0.95,
      }),
    ).concat(
      textLayer({
        ...baseLayer,
        x: badge.textX,
        y: badge.textY,
        fill: '#fff4d2',
      }),
    )
  }

  return [
    textLayer({
      ...baseLayer,
      x: badge.textX,
      y: badge.textY,
      fill: '#fff3df',
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

function renderFameMetricIcon(icon: string | null): string {
  const layout = KILLBOT_CENTER_LAYOUT.metrics.fame
  const x = layout.iconCenterX - layout.iconSize / 2
  const y = layout.iconCenterY - layout.iconSize / 2
  if (icon) {
    return `
      <image href="${escapeAttr(icon)}" x="${x}" y="${y}" width="${layout.iconSize}" height="${layout.iconSize}" preserveAspectRatio="xMidYMid meet" filter="url(#softShadow)"/>
    `
  }

  return `
    <circle cx="${layout.iconCenterX}" cy="${layout.iconCenterY}" r="22" fill="#4a2822" opacity="0.88" filter="url(#softShadow)"/>
    <path d="M${layout.iconCenterX - 10} ${layout.iconCenterY} H${layout.iconCenterX + 10} M${layout.iconCenterX} ${layout.iconCenterY - 10} V${layout.iconCenterY + 10}" stroke="#d59b73" stroke-width="4" stroke-linecap="round" opacity="0.92"/>
  `
}

function renderSilverMetricIcon(icon: string | null): string {
  const layout = KILLBOT_CENTER_LAYOUT.metrics.silver
  const x = layout.iconCenterX - layout.iconSize / 2
  const y = layout.iconCenterY - layout.iconSize / 2
  if (icon) {
    return `
      <circle cx="${layout.iconCenterX}" cy="${layout.iconCenterY}" r="27" fill="#efe0c9" opacity="0.34" filter="url(#softShadow)"/>
      <circle cx="${layout.iconCenterX}" cy="${layout.iconCenterY}" r="23" fill="#4f4b4a" opacity="0.38"/>
      <image href="${escapeAttr(icon)}" x="${x}" y="${y}" width="${layout.iconSize}" height="${layout.iconSize}" preserveAspectRatio="xMidYMid meet"/>
    `
  }

  return `
    <circle cx="${layout.iconCenterX}" cy="${layout.iconCenterY}" r="22" fill="#4f4b4a" opacity="0.86" filter="url(#softShadow)"/>
    <ellipse cx="${layout.iconCenterX - 6}" cy="${layout.iconCenterY}" rx="7" ry="12" fill="#d4d0c8" opacity="0.82"/>
    <ellipse cx="${layout.iconCenterX + 4}" cy="${layout.iconCenterY}" rx="7" ry="12" fill="#a9a49b" opacity="0.82"/>
  `
}

function renderRoleMarkers(): string {
  const { killer, victim } = KILLBOT_CENTER_LAYOUT.roles
  return `
    <rect x="${killer.underlineX}" y="${killer.underlineY}" width="${killer.underlineWidth}" height="3" rx="1.5" fill="${killer.color}" opacity="0.68"/>
    <rect x="${victim.underlineX}" y="${victim.underlineY}" width="${victim.underlineWidth}" height="3" rx="1.5" fill="${victim.color}" opacity="0.68"/>
  `
}

function renderKillMarker(icon: string | null, feedType: KillbotMatch['feedType']): string {
  const layout = KILLBOT_CENTER_LAYOUT.kill
  const x = layout.cx - layout.iconSize / 2
  const y = layout.cy - layout.iconSize / 2
  if (icon) {
    return `
      <image href="${escapeAttr(icon)}" x="${x}" y="${y}" width="${layout.iconSize}" height="${layout.iconSize}" preserveAspectRatio="xMidYMid meet" filter="url(#softShadow)"/>
    `
  }

  const fill = feedType === 'kill' ? '#27201c' : '#35201d'
  const accent = feedType === 'kill' ? '#dbb27a' : '#e39a7c'
  return `
    <g filter="url(#softShadow)">
      <circle cx="${layout.cx}" cy="${layout.cy}" r="${layout.radius}" fill="${fill}" opacity="0.94"/>
      <circle cx="${layout.cx}" cy="${layout.cy}" r="${layout.radius - 7}" fill="none" stroke="${accent}" stroke-width="4" opacity="0.55"/>
      <path d="M580 ${layout.cy - 12} C594 ${layout.cy - 30} 622 ${layout.cy - 30} 636 ${layout.cy - 12} M574 ${layout.cy + 18} C592 ${layout.cy + 38} 622 ${layout.cy + 38} 640 ${layout.cy + 18}" stroke="${accent}" stroke-width="6" stroke-linecap="round" opacity="0.82"/>
    </g>
  `
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
  const eventDate = formatEventDate(args.event.TimeStamp)
  const inventoryCount = victimInventoryCount(args.event)
  const battleId = Number(args.event.BattleId)
  const battleText = Number.isFinite(battleId) && battleId > 0
    ? `Battle #${Math.trunc(battleId)}`
    : `Event #${args.event.EventId}`
  const inventoryShown = Math.min(inventoryCount, INVENTORY_LIMIT)
  const inventoryLabel = inventoryCount > INVENTORY_LIMIT
    ? `${inventoryShown}/${inventoryCount}`
    : `${inventoryCount}`
  const victimBuild = args.valueEstimate?.gearSilver && args.valueEstimate.gearSilver > 0
    ? `Build: ${formatCompactSilver(args.valueEstimate.gearSilver)}`
    : null
  const victimInventoryValue = args.valueEstimate?.inventorySilver
    && args.valueEstimate.inventorySilver > 0
    ? `Bag: ${formatCompactSilver(args.valueEstimate.inventorySilver)}`
    : null
  const killerStats = compactStatLine([averageItemPowerLabel(args.event.Killer)])
  const victimStats = compactStatLine([
    victimBuild,
    averageItemPowerLabel(args.event.Victim),
  ])
  const inventoryStats = compactStatLine([
    `Items: ${inventoryLabel}`,
    victimInventoryValue,
  ])
  const eventType = args.match.feedType === 'death' ? 'DEATH' : 'KILL'
  const fameMetric = KILLBOT_CENTER_LAYOUT.metrics.fame
  const silverMetric = KILLBOT_CENTER_LAYOUT.metrics.silver
  const killerRole = KILLBOT_CENTER_LAYOUT.roles.killer
  const victimRole = KILLBOT_CENTER_LAYOUT.roles.victim

  return [
    textLayer({
      x: killerRole.labelX,
      y: killerRole.labelY,
      value: killerRole.label,
      size: killerRole.labelSize,
      weight: 900,
      fill: killerRole.color,
      anchor: 'middle',
      width: 118,
    }),
    textLayer({
      x: killerRole.nameX,
      y: killerRole.nameY,
      value: truncateCardText(killerName, 24),
      size: 34,
      weight: 900,
      fill: '#161412',
      anchor: 'middle',
    }),
    textLayer({
      x: killerRole.guildX,
      y: killerRole.guildY,
      value: truncateCardText(killerGuild, 32),
      size: 24,
      weight: 700,
      fill: '#2c2520',
      anchor: 'middle',
    }),
    textLayer({
      x: 600,
      y: 58,
      value: 'ALBION GUILD MANAGER',
      size: 21,
      weight: 900,
      fill: '#6a5b4f',
      anchor: 'middle',
    }),
    textLayer({
      x: victimRole.labelX,
      y: victimRole.labelY,
      value: victimRole.label,
      size: victimRole.labelSize,
      weight: 900,
      fill: victimRole.color,
      anchor: 'middle',
      width: 118,
    }),
    textLayer({
      x: victimRole.nameX,
      y: victimRole.nameY,
      value: truncateCardText(victimName, 24),
      size: 34,
      weight: 900,
      fill: '#161412',
      anchor: 'middle',
    }),
    textLayer({
      x: victimRole.guildX,
      y: victimRole.guildY,
      value: truncateCardText(victimGuild, 32),
      size: 24,
      weight: 700,
      fill: '#2c2520',
      anchor: 'middle',
    }),
    textLayer({
      x: fameMetric.valueX,
      y: fameMetric.valueY,
      value: formatNumber(args.match.fame),
      size: 34,
      weight: 900,
      fill: '#171412',
      anchor: fameMetric.valueAnchor,
      width: fameMetric.valueWidth,
    }),
    textLayer({
      x: silverMetric.valueX,
      y: silverMetric.valueY,
      value: estimateValueLabel(args.valueEstimate),
      size: 34,
      weight: 900,
      fill: '#171412',
      anchor: silverMetric.valueAnchor,
      width: silverMetric.valueWidth,
    }),
    textLayer({
      x: 600,
      y: 494,
      value: eventType,
      size: 42,
      weight: 900,
      fill: '#0f0d0b',
      anchor: 'middle',
    }),
    textLayer({
      x: 600,
      y: 535,
      value: eventDate,
      size: 23,
      weight: 800,
      fill: '#736457',
      anchor: 'middle',
    }),
    textLayer({
      x: 600,
      y: 564,
      value: battleText,
      size: 15,
      weight: 800,
      fill: '#8a7869',
      anchor: 'middle',
    }),
    textLayer({
      x: 386,
      y: 606,
      value: truncateCardText(killerStats, 30),
      size: 18,
      weight: 800,
      fill: '#776350',
      anchor: 'end',
    }),
    textLayer({
      x: 1158,
      y: 606,
      value: truncateCardText(victimStats, 34),
      size: 18,
      weight: 800,
      fill: '#776350',
      anchor: 'end',
    }),
    textLayer({
      x: 600,
      y: 635,
      value: "VICTIM'S INVENTORY",
      size: 20,
      weight: 900,
      fill: '#171412',
      anchor: 'middle',
    }),
    textLayer({
      x: 1158,
      y: 635,
      value: truncateCardText(inventoryStats, 38),
      size: 14,
      weight: 800,
      fill: '#8a7869',
      anchor: 'end',
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
  centerIcons: CenterIcons
}): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
      <defs>
        <filter id="slotShadow" x="-18%" y="-18%" width="136%" height="136%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#4e3524" flood-opacity="0.34"/>
        </filter>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#6b4a33" flood-opacity="0.20"/>
        </filter>
        <linearGradient id="cardBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#d2b18e"/>
          <stop offset="55%" stop-color="#c9a783"/>
          <stop offset="100%" stop-color="#bd956e"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#cardBg)"/>
      <path d="M0 230 C152 112 292 132 418 238 C486 295 540 320 600 320 C660 320 714 295 782 238 C908 132 1048 112 1200 230 L1200 0 L0 0 Z" fill="#9a6f51" opacity="0.08"/>
      <path d="M0 604 C175 548 330 568 478 628 C532 650 668 650 722 628 C870 568 1025 548 1200 604 L1200 800 L0 800 Z" fill="#ead0ae" opacity="0.11"/>
      <rect x="18" y="18" width="1164" height="760" rx="10" fill="none" stroke="#efd8ba" stroke-width="2" opacity="0.42"/>
      ${renderRoleMarkers()}

      ${renderFameMetricIcon(args.centerIcons.fame)}
      ${renderSilverMetricIcon(args.centerIcons.silver)}

      ${renderKillMarker(args.centerIcons.kill, args.match.feedType)}

      <rect x="42" y="617" width="438" height="1.5" fill="#9f7657" opacity="0.22"/>
      <rect x="720" y="617" width="438" height="1.5" fill="#9f7657" opacity="0.22"/>
      <rect x="40" y="646" width="1120" height="108" rx="8" fill="#d9b388" opacity="0.18"/>

      ${renderEquipmentGroup({ layout: LEFT_EQUIPMENT_LAYOUT, equipment: args.leftEquipment, icons: args.icons })}
      ${renderEquipmentGroup({ layout: RIGHT_EQUIPMENT_LAYOUT, equipment: args.rightEquipment, icons: args.icons })}
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
  const centerIcons = await loadCenterIcons()
  const svg = buildSvg({
    event,
    match,
    leftEquipment,
    rightEquipment,
    inventory,
    icons,
    centerIcons,
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
