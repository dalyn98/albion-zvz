import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, '..')
const RAW_DIR = join(ROOT, 'public/marketing/reddit/raw')
const OUTPUT_DIR = join(ROOT, 'public/marketing/reddit/campaign')
const ICON_PATH = join(ROOT, 'public/brand/agm-app-icon-source.png')
const WIDTH = 1600
const HEIGHT = 900

const colors = {
  background: '#080a0f',
  surface: '#10131a',
  surface2: '#161a23',
  border: '#2a2f3a',
  text: '#f7f7f5',
  muted: '#a7adb8',
  amber: '#f5b51b',
  amberSoft: '#2c2210',
  green: '#46d49d',
  red: '#ff6b72',
  blue: '#63a4ff',
  discord: '#5865f2',
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function text(x, y, value, size, options = {}) {
  const {
    fill = colors.text,
    weight = 600,
    anchor = 'start',
    letterSpacing = 0,
    opacity = 1,
  } = options
  return `<text x="${x}" y="${y}" fill="${fill}" fill-opacity="${opacity}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${escapeXml(value)}</text>`
}

function multiline(x, y, lines, size, options = {}) {
  const lineHeight = options.lineHeight ?? Math.round(size * 1.12)
  return lines
    .map((line, index) => text(x, y + index * lineHeight, line, size, options))
    .join('')
}

function pill(x, y, label, options = {}) {
  const {
    width = Math.max(128, label.length * 13 + 38),
    fill = colors.surface2,
    stroke = colors.border,
    textFill = colors.text,
  } = options
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="44" rx="22" fill="${fill}" stroke="${stroke}"/>`,
    text(x + width / 2, y + 29, label, 17, { fill: textFill, weight: 700, anchor: 'middle' }),
  ].join('')
}

function baseSvg(content) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      <defs>
        <radialGradient id="amberGlow" cx="0" cy="0" r="1" gradientTransform="translate(1450 40) rotate(142) scale(680 560)" gradientUnits="userSpaceOnUse">
          <stop stop-color="#f5b51b" stop-opacity=".18"/>
          <stop offset="1" stop-color="#f5b51b" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="bottomFade" x1="800" y1="300" x2="800" y2="900" gradientUnits="userSpaceOnUse">
          <stop stop-color="#080a0f" stop-opacity="0"/>
          <stop offset="1" stop-color="#080a0f" stop-opacity=".96"/>
        </linearGradient>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity=".028"/>
        </pattern>
      </defs>
      <rect width="1600" height="900" fill="${colors.background}"/>
      <rect width="1600" height="900" fill="url(#grid)"/>
      <rect width="1600" height="900" fill="url(#amberGlow)"/>
      ${content}
    </svg>
  `)
}

async function roundedImage(path, width, height, options = {}) {
  const radius = options.radius ?? 28
  const image = await sharp(path)
    .resize(width, height, {
      fit: options.fit ?? 'cover',
      position: options.position ?? 'top',
    })
    .png()
    .toBuffer()
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="white"/></svg>`,
  )
  return sharp(image).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

async function brandIcon(size) {
  return roundedImage(ICON_PATH, size, size, { radius: Math.round(size * 0.24) })
}

function brandHeader(kicker) {
  return [
    text(100, 78, 'AGM', 24, { fill: colors.amber, weight: 900, letterSpacing: 2 }),
    text(166, 78, 'ALBION GUILD OPS', 18, { fill: colors.muted, weight: 700, letterSpacing: 2 }),
    text(1500, 78, kicker, 16, { fill: colors.muted, weight: 700, anchor: 'end', letterSpacing: 1.4 }),
  ].join('')
}

async function renderOverview() {
  const event = await roundedImage(join(RAW_DIR, 'event-operations.png'), 840, 472, { radius: 24 })
  const icon = await brandIcon(64)
  const overlay = baseSvg([
    `<rect x="720" y="176" width="840" height="472" rx="24" fill="${colors.surface}" stroke="${colors.border}" stroke-width="2"/>`,
    `<rect x="718" y="174" width="844" height="476" rx="26" fill="none" stroke="#f5b51b" stroke-opacity=".34" stroke-width="2"/>`,
    `<rect x="78" y="54" width="64" height="64" rx="15" fill="${colors.surface2}" stroke="${colors.border}"/>`,
    text(164, 85, 'AGM', 27, { fill: colors.amber, weight: 900, letterSpacing: 2 }),
    text(164, 111, 'ALBION GUILD OPS', 15, { fill: colors.muted, weight: 700, letterSpacing: 1.8 }),
    text(80, 194, 'FOR GUILD MASTERS · OFFICERS · CALLERS', 16, { fill: colors.amber, weight: 800, letterSpacing: 1.8 }),
    multiline(80, 274, ['Run your Albion guild', 'without spreadsheets.'], 60, { weight: 850, lineHeight: 68 }),
    multiline(80, 442, ['Events, comps, battle tracking, and', 'review-first regear — connected to Discord.'], 24, { fill: colors.muted, weight: 500, lineHeight: 34 }),
    pill(80, 550, 'Events', { width: 128, fill: colors.amberSoft, stroke: '#5b471a', textFill: '#ffd879' }),
    pill(220, 550, 'Comps', { width: 128 }),
    pill(360, 550, 'Battles', { width: 138 }),
    pill(510, 550, 'Regear', { width: 138 }),
    `<rect x="80" y="700" width="510" height="2" fill="#f5b51b" fill-opacity=".36"/>`,
    text(80, 748, 'albion-guildmanager.com', 24, { fill: colors.text, weight: 750 }),
    text(80, 784, 'Free during beta · No payment information required', 17, { fill: colors.muted, weight: 500 }),
    text(1500, 836, 'REAL DEMO UI · SAMPLE DATA', 14, { fill: colors.muted, weight: 700, anchor: 'end', letterSpacing: 1.5 }),
  ].join(''))

  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: colors.background } })
    .composite([
      { input: overlay },
      { input: icon, left: 78, top: 54 },
      { input: event, left: 720, top: 176 },
    ])
    .png()
    .toBuffer()
}

async function renderEventOperations() {
  const event = await roundedImage(join(RAW_DIR, 'event-operations.png'), 1420, 610, { radius: 24, position: 'top' })
  const overlay = baseSvg([
    brandHeader('02 · EVENT OPERATIONS'),
    text(80, 154, 'Build the comp before the CTA.', 48, { weight: 850 }),
    text(80, 196, 'Members choose slots. Officers see missing roles instantly.', 22, { fill: colors.muted, weight: 500 }),
    pill(80, 222, '1 · Publish', { width: 160, fill: colors.amberSoft, stroke: '#5b471a', textFill: '#ffd879' }),
    pill(252, 222, '2 · Members pick', { width: 212 }),
    pill(476, 222, '3 · Officers fill gaps', { width: 244 }),
    `<rect x="90" y="302" width="1420" height="520" rx="24" fill="${colors.surface}" stroke="${colors.border}" stroke-width="2"/>`,
    `<rect x="90" y="302" width="1420" height="520" rx="24" fill="url(#bottomFade)" opacity=".12"/>`,
    text(1500, 860, 'EVENT INFO · BUILD SHEET · LIVE SLOT COVERAGE', 14, { fill: colors.muted, weight: 700, anchor: 'end', letterSpacing: 1.3 }),
  ].join(''))
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: colors.background } })
    .composite([
      { input: overlay },
      { input: event, left: 90, top: 302 },
    ])
    .png()
    .toBuffer()
}

async function renderRegearFlow() {
  const regear = await roundedImage(join(RAW_DIR, 'regear-approvals.png'), 1420, 560, { radius: 24, position: 'top' })
  const overlay = baseSvg([
    brandHeader('03 · REVIEW-FIRST REGEAR'),
    text(80, 154, 'Turn battle deaths into review-ready regear.', 46, { weight: 850 }),
    text(80, 196, 'Automation prepares the claim. Officers keep the final decision.', 22, { fill: colors.muted, weight: 500 }),
    pill(80, 224, 'Killboard sync', { width: 190, fill: '#10271f', stroke: '#245f48', textFill: colors.green }),
    text(292, 254, '→', 28, { fill: colors.muted, weight: 700 }),
    pill(330, 224, 'Claim + cap check', { width: 220, fill: colors.amberSoft, stroke: '#5b471a', textFill: '#ffd879' }),
    text(572, 254, '→', 28, { fill: colors.muted, weight: 700 }),
    pill(610, 224, 'Officer approval', { width: 206, fill: '#17233a', stroke: '#2c4b7b', textFill: '#9ec4ff' }),
    `<rect x="90" y="320" width="1420" height="510" rx="24" fill="${colors.surface}" stroke="${colors.border}" stroke-width="2"/>`,
    `<rect x="1168" y="342" width="312" height="76" rx="18" fill="#101f1a" stroke="#245f48"/>`,
    text(1194, 372, 'REVIEW-FIRST', 13, { fill: colors.green, weight: 800, letterSpacing: 1.5 }),
    text(1194, 399, 'No silent payout', 20, { fill: colors.text, weight: 750 }),
    text(1500, 866, 'AUTO + MANUAL CLAIMS · AUDITABLE APPROVALS', 14, { fill: colors.muted, weight: 700, anchor: 'end', letterSpacing: 1.3 }),
  ].join(''))
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: colors.background } })
    .composite([
      { input: overlay },
      { input: regear, left: 90, top: 320 },
    ])
    .png()
    .toBuffer()
}

function discordMockSvg() {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="620" height="536" viewBox="0 0 620 536">
      <rect width="620" height="536" rx="24" fill="#313338"/>
      <rect width="620" height="62" rx="24" fill="#2b2d31"/>
      <rect y="40" width="620" height="22" fill="#2b2d31"/>
      ${text(28, 39, '#  event-announcements', 19, { fill: '#f2f3f5', weight: 750 })}
      <circle cx="56" cy="110" r="25" fill="${colors.amber}"/>
      ${text(56, 118, 'A', 23, { fill: '#17120a', weight: 900, anchor: 'middle' })}
      ${text(94, 103, 'AGM', 18, { fill: '#f2f3f5', weight: 750 })}
      <rect x="142" y="84" width="42" height="22" rx="4" fill="${colors.discord}"/>
      ${text(163, 100, 'APP', 11, { fill: '#ffffff', weight: 800, anchor: 'middle' })}
      ${text(94, 127, 'Today at 21:00', 13, { fill: '#949ba4', weight: 500 })}
      ${text(28, 170, '@everyone', 17, { fill: '#c9cdfb', weight: 700 })}
      ${text(132, 170, 'CTA at 21:00!', 17, { fill: '#dbdee1', weight: 500 })}
      <rect x="28" y="194" width="564" height="228" rx="6" fill="#2b2d31"/>
      <rect x="28" y="194" width="5" height="228" rx="2" fill="${colors.discord}"/>
      ${text(52, 230, 'Roads 7v7 — Mercia Ore', 20, { fill: '#ffffff', weight: 750 })}
      ${text(52, 270, 'GATHER AT', 12, { fill: '#b5bac1', weight: 800 })}
      ${text(52, 296, 'Today · 22:00', 16, { fill: '#dbdee1', weight: 500 })}
      ${text(302, 270, 'LOCATION', 12, { fill: '#b5bac1', weight: 800 })}
      ${text(302, 296, 'Black Zone — Mercia', 16, { fill: '#dbdee1', weight: 500 })}
      ${text(52, 344, 'NOTES', 12, { fill: '#b5bac1', weight: 800 })}
      ${text(52, 370, 'Mercia ore route — rally at 22:00 sharp.', 15, { fill: '#dbdee1', weight: 500 })}
      ${text(52, 403, 'albion-guildmanager.com/events/...', 13, { fill: '#949ba4', weight: 500 })}
      <rect x="28" y="444" width="176" height="54" rx="7" fill="${colors.discord}"/>
      ${text(116, 478, 'View event', 16, { fill: '#ffffff', weight: 750, anchor: 'middle' })}
      <rect x="216" y="444" width="176" height="54" rx="7" fill="#4e5058"/>
      ${text(304, 478, 'Sign up', 16, { fill: '#ffffff', weight: 750, anchor: 'middle' })}
    </svg>
  `)
}

async function renderDiscordConnected() {
  const battle = await roundedImage(join(RAW_DIR, 'battle-records.png'), 710, 536, { radius: 24, position: 'left' })
  const discord = discordMockSvg()
  const overlay = baseSvg([
    brandHeader('04 · DISCORD-CONNECTED'),
    text(80, 154, 'Keep members in Discord. Keep operations organized.', 44, { weight: 850 }),
    text(80, 196, 'Publish once. Signups, battle records, and follow-up work stay connected.', 22, { fill: colors.muted, weight: 500 }),
    `<rect x="80" y="256" width="620" height="536" rx="24" fill="#313338" stroke="#4d515a" stroke-width="2"/>`,
    `<rect x="810" y="256" width="710" height="536" rx="24" fill="${colors.surface}" stroke="${colors.border}" stroke-width="2"/>`,
    `<circle cx="755" cy="524" r="34" fill="${colors.amberSoft}" stroke="#5b471a"/>`,
    text(755, 535, '→', 34, { fill: '#ffd879', weight: 800, anchor: 'middle' }),
    text(80, 830, 'DISCORD ANNOUNCEMENT', 14, { fill: '#c9cdfb', weight: 800, letterSpacing: 1.4 }),
    text(810, 830, 'AUTOMATIC BATTLE LEDGER', 14, { fill: colors.green, weight: 800, letterSpacing: 1.4 }),
    text(1500, 866, 'DISCORD IN · OPERATIONS OUT', 14, { fill: colors.muted, weight: 700, anchor: 'end', letterSpacing: 1.3 }),
  ].join(''))
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: colors.background } })
    .composite([
      { input: overlay },
      { input: discord, left: 80, top: 256 },
      { input: battle, left: 810, top: 256 },
    ])
    .png()
    .toBuffer()
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const outputs = [
    ['01-overview.png', await renderOverview()],
    ['02-event-operations.png', await renderEventOperations()],
    ['03-review-first-regear.png', await renderRegearFlow()],
    ['04-discord-connected.png', await renderDiscordConnected()],
  ]

  for (const [filename, buffer] of outputs) {
    await sharp(buffer).png({ compressionLevel: 9 }).toFile(join(OUTPUT_DIR, filename))
    console.log(join('public/marketing/reddit/campaign', filename))
  }
}

await main()
