import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import {
  formatKillbotCompactFame,
  type KillbotBattleForceLine,
  type KillbotBattleSummary,
} from '@/lib/killbot-battle'
import {
  KILLBOT_CARD_FONT_FAMILY,
  KILLBOT_CARD_FONT_FILE,
} from '@/lib/killbot-card'

export const KILLBOT_BATTLE_CARD_WIDTH = 1200
export const KILLBOT_BATTLE_CARD_HEIGHT = 630

const CARD_PADDING_X = 56
const CARD_PADDING_Y = 44
const ROW_START_Y = 218
const ROW_HEIGHT = 82
const ROW_GAP = 12
const MAX_FORCE_ROWS = 4
const KILLBOT_FONTCONFIG_DIR = path.join('/tmp', 'albion-killbot-fontconfig')
const KILLBOT_FONTCONFIG_FILE = path.join(KILLBOT_FONTCONFIG_DIR, 'fonts.conf')

let fontconfigSetup: Promise<void> | null = null

interface TextLayer {
  x: number
  y: number
  value: string
  size: number
  weight?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  width?: number
}

function fontconfigXml(): string {
  return [
    '<?xml version="1.0"?>',
    '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
    '<fontconfig>',
    `  <dir>${path.dirname(KILLBOT_CARD_FONT_FILE)}</dir>`,
    '  <cachedir>/tmp/fontconfig-cache</cachedir>',
    '</fontconfig>',
    '',
  ].join('\n')
}

async function ensureKillbotFontconfig(): Promise<void> {
  if (process.env.FONTCONFIG_PATH) return
  if (!fontconfigSetup) {
    fontconfigSetup = (async () => {
      process.env.FONTCONFIG_PATH = KILLBOT_FONTCONFIG_DIR
      process.env.FONTCONFIG_FILE = KILLBOT_FONTCONFIG_FILE
      await mkdir(KILLBOT_FONTCONFIG_DIR, { recursive: true })
      await writeFile(KILLBOT_FONTCONFIG_FILE, fontconfigXml(), 'utf8')
    })().catch(() => {
      process.env.FONTCONFIG_PATH = ''
      process.env.FONTCONFIG_FILE = ''
    })
  }
  await fontconfigSetup
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function pangoEscape(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

function truncateCardText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}...`
}

function nonNegativeInteger(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

function formatInteger(value: number): string {
  return nonNegativeInteger(value).toLocaleString('en-US')
}

function battleIdsLabel(summary: KillbotBattleSummary): string | null {
  const firstLine = summary.description.split('\n', 1)[0] ?? ''
  const ids = firstLine.match(/(?:Albion battles|Battle) ([0-9, ]+)/)?.[1]
  if (!ids) return null
  const values = ids.split(',').map((id) => id.trim()).filter(Boolean)
  if (values.length <= 1) return values[0] ? `Battle ${values[0]}` : null
  return `${values.length} battles`
}

function formatDateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute} UTC`
}

function summarizeForceGuildNames(line: KillbotBattleForceLine): string | null {
  const forceKey = line.forceName.trim().toLocaleLowerCase('en-US')
  const guildNames = Array.from(
    new Set(
      (line.guildNames ?? [])
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  )
  if (guildNames.length === 0) return null
  if (guildNames.length === 1 && guildNames[0].toLocaleLowerCase('en-US') === forceKey) {
    return null
  }
  if (guildNames.length <= 2) return guildNames.join(', ')
  return `${guildNames.slice(0, 2).join(', ')} +${guildNames.length - 2}`
}

function forceAccent(line: KillbotBattleForceLine): string {
  if (line.kills > line.deaths) return '#35d185'
  if (line.deaths > line.kills) return '#fb7185'
  return '#fbbf24'
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
  if (!layer.value) return null
  const width = textLayerWidth(layer)
  const fill = layer.fill ?? '#f8fafc'
  return {
    input: {
      text: {
        text: `<span foreground="${fill}" weight="${layer.weight ?? 400}">${pangoEscape(layer.value)}</span>`,
        font: `${KILLBOT_CARD_FONT_FAMILY} ${layer.size}`,
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

function rowY(index: number): number {
  return ROW_START_Y + index * (ROW_HEIGHT + ROW_GAP)
}

function renderTableFrame(lines: KillbotBattleForceLine[]): string {
  const rows = lines.slice(0, MAX_FORCE_ROWS)
  return rows
    .map((line, index) => {
      const y = rowY(index)
      const accent = forceAccent(line)
      return `
        <rect x="${CARD_PADDING_X}" y="${y}" width="1088" height="${ROW_HEIGHT}" rx="8" fill="#111827" opacity="${index % 2 === 0 ? '0.92' : '0.82'}"/>
        <rect x="${CARD_PADDING_X}" y="${y}" width="6" height="${ROW_HEIGHT}" rx="3" fill="${accent}"/>
        <rect x="${CARD_PADDING_X}" y="${y}" width="1088" height="${ROW_HEIGHT}" rx="8" fill="none" stroke="#263246" stroke-width="1"/>
      `
    })
    .join('\n')
}

function buildSvg(summary: KillbotBattleSummary): string {
  const rows = summary.forceLines.slice(0, MAX_FORCE_ROWS)
  const totalKills = rows.reduce((sum, line) => sum + nonNegativeInteger(line.kills), 0)
  const totalDeaths = rows.reduce((sum, line) => sum + nonNegativeInteger(line.deaths), 0)
  const totalFame = rows.reduce((sum, line) => sum + nonNegativeInteger(line.killFame), 0)

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${KILLBOT_BATTLE_CARD_WIDTH}" height="${KILLBOT_BATTLE_CARD_HEIGHT}" viewBox="0 0 ${KILLBOT_BATTLE_CARD_WIDTH} ${KILLBOT_BATTLE_CARD_HEIGHT}">
      <defs>
        <linearGradient id="cardBg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0b1020"/>
          <stop offset="58%" stop-color="#101827"/>
          <stop offset="100%" stop-color="#161313"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${KILLBOT_BATTLE_CARD_WIDTH}" height="${KILLBOT_BATTLE_CARD_HEIGHT}" fill="url(#cardBg)"/>
      <rect x="24" y="24" width="1152" height="582" rx="10" fill="none" stroke="#334155" stroke-width="1.5" opacity="0.65"/>
      <rect x="${CARD_PADDING_X}" y="${CARD_PADDING_Y}" width="1088" height="118" rx="8" fill="#111827" opacity="0.74"/>
      <rect x="${CARD_PADDING_X}" y="176" width="1088" height="30" rx="6" fill="#0f172a" opacity="0.92"/>
      ${renderTableFrame(rows)}
      <rect x="${CARD_PADDING_X}" y="586" width="1088" height="1" fill="#334155" opacity="0.7"/>
      <metadata>${escapeText(`${summary.title} ${totalKills} ${totalDeaths} ${totalFame}`)}</metadata>
    </svg>
  `
}

function buildTextLayers(summary: KillbotBattleSummary): TextLayer[] {
  const rows = summary.forceLines.slice(0, MAX_FORCE_ROWS)
  const headerSubline = [
    battleIdsLabel(summary),
    formatDateLabel(summary.startedAt),
  ].filter((part): part is string => !!part).join('  |  ')

  const layers: TextLayer[] = [
    {
      x: CARD_PADDING_X + 24,
      y: 82,
      value: 'ALBION BATTLE FORCES',
      size: 21,
      weight: 900,
      fill: '#fbbf24',
      width: 360,
    },
    {
      x: CARD_PADDING_X + 24,
      y: 122,
      value: truncateCardText(summary.title, 52),
      size: 30,
      weight: 900,
      fill: '#f8fafc',
      width: 980,
    },
    {
      x: CARD_PADDING_X + 24,
      y: 152,
      value: truncateCardText(headerSubline, 74),
      size: 16,
      weight: 700,
      fill: '#94a3b8',
      width: 980,
    },
    {
      x: 90,
      y: 197,
      value: 'FORCE',
      size: 14,
      weight: 900,
      fill: '#94a3b8',
      width: 310,
    },
    {
      x: 642,
      y: 197,
      value: 'PLAYERS',
      size: 14,
      weight: 900,
      fill: '#94a3b8',
      anchor: 'end',
      width: 88,
    },
    {
      x: 776,
      y: 197,
      value: 'KILLS',
      size: 14,
      weight: 900,
      fill: '#94a3b8',
      anchor: 'end',
      width: 84,
    },
    {
      x: 906,
      y: 197,
      value: 'DEATHS',
      size: 14,
      weight: 900,
      fill: '#94a3b8',
      anchor: 'end',
      width: 86,
    },
    {
      x: 1106,
      y: 197,
      value: 'FAME',
      size: 14,
      weight: 900,
      fill: '#94a3b8',
      anchor: 'end',
      width: 120,
    },
    {
      x: CARD_PADDING_X,
      y: 612,
      value: 'Albion Guild Manager',
      size: 15,
      weight: 800,
      fill: '#64748b',
      width: 560,
    },
  ]

  rows.forEach((line, index) => {
    const y = rowY(index)
    const guildLabel = summarizeForceGuildNames(line)
    layers.push(
      {
        x: 90,
        y: y + 34,
        value: truncateCardText(line.forceName, 32),
        size: 26,
        weight: 900,
        fill: '#f8fafc',
        width: 430,
      },
      {
        x: 90,
        y: y + 64,
        value: truncateCardText(guildLabel ?? '', 48),
        size: 15,
        weight: 700,
        fill: '#94a3b8',
        width: 430,
      },
      {
        x: 642,
        y: y + 51,
        value: formatInteger(line.players),
        size: 25,
        weight: 900,
        fill: '#e2e8f0',
        anchor: 'end',
        width: 88,
      },
      {
        x: 776,
        y: y + 51,
        value: formatInteger(line.kills),
        size: 25,
        weight: 900,
        fill: '#35d185',
        anchor: 'end',
        width: 84,
      },
      {
        x: 906,
        y: y + 51,
        value: formatInteger(line.deaths),
        size: 25,
        weight: 900,
        fill: '#fb7185',
        anchor: 'end',
        width: 86,
      },
      {
        x: 1106,
        y: y + 51,
        value: formatKillbotCompactFame(line.killFame),
        size: 25,
        weight: 900,
        fill: '#fbbf24',
        anchor: 'end',
        width: 120,
      },
    )
  })

  if (rows.length === 0) {
    layers.push({
      x: 600,
      y: 356,
      value: 'No force data available',
      size: 30,
      weight: 900,
      fill: '#94a3b8',
      anchor: 'middle',
      width: 520,
    })
  }

  return layers
}

export async function renderKillbotBattleSummaryCardPng(
  summary: KillbotBattleSummary,
): Promise<Buffer> {
  await ensureKillbotFontconfig()
  const svg = buildSvg(summary)
  const textComposites = buildTextLayers(summary)
    .map(textToComposite)
    .filter((overlay): overlay is OverlayOptions => overlay !== null)
  const base = sharp(Buffer.from(svg))
  return (textComposites.length > 0 ? base.composite(textComposites) : base).png().toBuffer()
}
