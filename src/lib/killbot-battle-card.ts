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

const CARD_PADDING_X = 48
const CARD_PADDING_Y = 36
const TABLE_HEADER_Y = 174
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

interface RowLayout {
  startY: number
  rowHeight: number
  rowGap: number
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

function rowLayout(rowCount: number): RowLayout {
  const visibleRows = Math.max(1, Math.min(MAX_FORCE_ROWS, rowCount))
  if (visibleRows === 1) {
    return { startY: 232, rowHeight: 156, rowGap: 0 }
  }
  if (visibleRows === 2) {
    return { startY: 220, rowHeight: 134, rowGap: 16 }
  }
  if (visibleRows === 3) {
    return { startY: 214, rowHeight: 110, rowGap: 14 }
  }
  return { startY: 214, rowHeight: 90, rowGap: 9 }
}

function rowY(index: number, layout: RowLayout): number {
  return layout.startY + index * (layout.rowHeight + layout.rowGap)
}

function renderTableFrame(lines: KillbotBattleForceLine[], layout: RowLayout): string {
  const rows = lines.slice(0, MAX_FORCE_ROWS)
  return rows
    .map((line, index) => {
      const y = rowY(index, layout)
      const accent = forceAccent(line)
      return `
        <rect x="${CARD_PADDING_X}" y="${y}" width="1104" height="${layout.rowHeight}" rx="9" fill="#111827" opacity="${index % 2 === 0 ? '0.96' : '0.88'}"/>
        <rect x="${CARD_PADDING_X}" y="${y}" width="8" height="${layout.rowHeight}" rx="4" fill="${accent}"/>
        <rect x="${CARD_PADDING_X}" y="${y}" width="1104" height="${layout.rowHeight}" rx="9" fill="none" stroke="#334155" stroke-width="1.2"/>
      `
    })
    .join('\n')
}

function buildSvg(summary: KillbotBattleSummary): string {
  const rows = summary.forceLines.slice(0, MAX_FORCE_ROWS)
  const layout = rowLayout(rows.length)
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
      <rect x="20" y="20" width="1160" height="590" rx="10" fill="none" stroke="#3b4a63" stroke-width="2" opacity="0.75"/>
      <rect x="${CARD_PADDING_X}" y="${CARD_PADDING_Y}" width="1104" height="128" rx="9" fill="#111827" opacity="0.82"/>
      <rect x="${CARD_PADDING_X}" y="${TABLE_HEADER_Y}" width="1104" height="34" rx="7" fill="#0f172a" opacity="0.96"/>
      ${renderTableFrame(rows, layout)}
      <metadata>${escapeText(`${summary.title} ${totalKills} ${totalDeaths} ${totalFame}`)}</metadata>
    </svg>
  `
}

function buildTextLayers(summary: KillbotBattleSummary): TextLayer[] {
  const rows = summary.forceLines.slice(0, MAX_FORCE_ROWS)
  const layout = rowLayout(rows.length)
  const headerSubline = [
    battleIdsLabel(summary),
    formatDateLabel(summary.startedAt),
  ].filter((part): part is string => !!part).join('  |  ')

  const layers: TextLayer[] = [
    {
      x: CARD_PADDING_X + 24,
      y: 76,
      value: 'ALBION BATTLE FORCES',
      size: 24,
      weight: 900,
      fill: '#fbbf24',
      width: 430,
    },
    {
      x: CARD_PADDING_X + 24,
      y: 121,
      value: truncateCardText(summary.title, 46),
      size: 36,
      weight: 900,
      fill: '#f8fafc',
      width: 1010,
    },
    {
      x: CARD_PADDING_X + 24,
      y: 154,
      value: truncateCardText(headerSubline, 74),
      size: 20,
      weight: 800,
      fill: '#b6c3d7',
      width: 1010,
    },
    {
      x: 84,
      y: 199,
      value: 'FORCE',
      size: 17,
      weight: 900,
      fill: '#b6c3d7',
      width: 330,
    },
    {
      x: 646,
      y: 199,
      value: 'PLAYERS',
      size: 17,
      weight: 900,
      fill: '#b6c3d7',
      anchor: 'end',
      width: 104,
    },
    {
      x: 782,
      y: 199,
      value: 'KILLS',
      size: 17,
      weight: 900,
      fill: '#b6c3d7',
      anchor: 'end',
      width: 96,
    },
    {
      x: 920,
      y: 199,
      value: 'DEATHS',
      size: 17,
      weight: 900,
      fill: '#b6c3d7',
      anchor: 'end',
      width: 106,
    },
    {
      x: 1110,
      y: 199,
      value: 'FAME',
      size: 17,
      weight: 900,
      fill: '#b6c3d7',
      anchor: 'end',
      width: 132,
    },
  ]

  rows.forEach((line, index) => {
    const y = rowY(index, layout)
    const nameY = y + Math.max(42, Math.round(layout.rowHeight * 0.38))
    const guildY = y + Math.max(68, Math.round(layout.rowHeight * 0.72))
    const numberY = y + Math.round(layout.rowHeight * 0.62)
    const guildLabel = summarizeForceGuildNames(line)
    layers.push(
      {
        x: 84,
        y: nameY,
        value: truncateCardText(line.forceName, 28),
        size: 33,
        weight: 900,
        fill: '#f8fafc',
        width: 450,
      },
      {
        x: 84,
        y: guildY,
        value: truncateCardText(guildLabel ?? '', 42),
        size: 19,
        weight: 800,
        fill: '#b6c3d7',
        width: 450,
      },
      {
        x: 646,
        y: numberY,
        value: formatInteger(line.players),
        size: 33,
        weight: 900,
        fill: '#e2e8f0',
        anchor: 'end',
        width: 104,
      },
      {
        x: 782,
        y: numberY,
        value: formatInteger(line.kills),
        size: 33,
        weight: 900,
        fill: '#35d185',
        anchor: 'end',
        width: 96,
      },
      {
        x: 920,
        y: numberY,
        value: formatInteger(line.deaths),
        size: 33,
        weight: 900,
        fill: '#fb7185',
        anchor: 'end',
        width: 106,
      },
      {
        x: 1110,
        y: numberY,
        value: formatKillbotCompactFame(line.killFame),
        size: 33,
        weight: 900,
        fill: '#fbbf24',
        anchor: 'end',
        width: 132,
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
