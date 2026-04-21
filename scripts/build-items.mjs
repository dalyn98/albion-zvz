#!/usr/bin/env node
// Fetches the latest Albion items.json and produces a trimmed, preprocessed
// bundle under src/data/albion-items.json. Runs as a prebuild step so every
// Vercel deploy picks up new patches without touching runtime code.
//
// Why trim at build time: the upstream items.json is several MB with ~15k
// entries. Filtering per-request at runtime dominates latency (~1s). By
// keeping only the tiers and categories we actually search, the bundle
// drops to well under 500KB and per-request filtering is a few ms.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ITEMS_URL = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json'

// Same patterns as the old runtime filter — see src/app/api/items/search/route.ts
// history for provenance. Keep both in sync.
const CATEGORY_PATTERNS = {
  weapon:  /^T\d+_(MAIN|2H)_/,
  offhand: /^T\d+_OFF_/,
  head:    /^T\d+_HEAD_/,
  armor:   /^T\d+_ARMOR_/,
  shoes:   /^T\d+_SHOES_/,
  cape:    /^T\d+_CAPE(ITEM)?($|_|@)/,
  food:    /^T\d+_MEAL_/,
  potion:  /^T\d+_(POTION|FOCUSPOTION)/,
  // Mount category covers regular mounts (horse/ox/direwolf/stag/swiftclaw/...)
  // _and_ non-unique battle mounts (SWAMPDRAGON_BATTLE, MAMMOTH_BATTLE). Unique
  // battle mounts (UNIQUE_MOUNT_*) are handled separately via MOUNT_OVERRIDES
  // since they don't carry tier prefixes.
  mount:   /^T\d+_MOUNT_/,
}
// Categories allowed across multiple tiers. Others restrict to T8 only to
// keep the bundle small. Mounts need the full T4-T8 range because recall
// mounts (T5 stag), transport oxen, and various battle mounts live below T8.
const CATEGORY_TIER_REGEX = {
  food:  /^T[678]_/,
  potion:/^T[678]_/,
  mount: /^T[4-8]_/,
}
const DEFAULT_TIER_REGEX = /^T8_/

// Battle mounts are a hand-picked list that skips the normal category/tier
// pattern matching. Korean upstream names include "실버 " / "화염의 " prefixes
// that don't match how guildmates refer to them — so we override display names
// and stuff Korean/English synonyms into `kExtra` to widen search.
const MOUNT_OVERRIDES = {
  'T6_MOUNT_SIEGE_BALLISTA':              { d: '공성포',            kExtra: '시즈 발리스타 발리스타 공성포' },
  'UNIQUE_MOUNT_ARMORED_EAGLE_SILVER':    { d: '배틀 이글',         kExtra: '배틀이글' },
  'UNIQUE_MOUNT_RHINO_SEASON_SILVER':     { d: '배틀 라이노',       kExtra: '배틀라이노' },
  'UNIQUE_MOUNT_ENT_SILVER':              { d: '에이션트 엔트',     kExtra: '고대 엔트 에이션트엔트 엔트' },
  'T8_MOUNT_MAMMOTH_BATTLE@1':            { d: '커맨드 맘모스',     kExtra: '지휘 맘모스 커맨드맘모스 맘모스' },
  'UNIQUE_MOUNT_BEETLE_SILVER':           { d: '콜로서스 비틀',     kExtra: '거대 딱정벌레 콜로서스비틀 콜로서슬 비틀' },
  'UNIQUE_MOUNT_TOWER_CHARIOT_SILVER':    { d: '타워 체리엇',       kExtra: '타워 전차 타워체리엇 체리엇 체리어트' },
  'UNIQUE_MOUNT_JUGGERNAUT_SILVER':       { d: '저거넛트',          kExtra: '저거너트 저거넛' },
  'UNIQUE_MOUNT_BASTION_SILVER':          { d: '로빙 바스티온',     kExtra: '방랑하는 요새 로빙바스티온 바스티온' },
  'UNIQUE_MOUNT_BEHEMOTH_SILVER':         { d: '베헤모스',          kExtra: '베헤메모스' },
  'UNIQUE_MOUNT_BATTLESPIDER_SILVER':     { d: '골리앗',            kExtra: '골리앗 호스이터 골리앗호스이터' },
  'UNIQUE_MOUNT_TANKBEETLE_SILVER':       { d: '팔랑크스 비틀',     kExtra: '팔랑크스 딱정벌레 팔랑크스비틀 팔랑크스' },
  'T7_MOUNT_ARMORED_SWAMPDRAGON_BATTLE':  { d: '베놈 바실리스크',   kExtra: '독 바실리스크 베놈바실리스크 바실리스크' },
  'T7_MOUNT_SWAMPDRAGON_BATTLE':          { d: '플레임 바실리스크', kExtra: '화염의 바실리스크 플레임바실리스크 바실리스크' },
}

function categoryOf(uniqueName) {
  for (const [cat, regex] of Object.entries(CATEGORY_PATTERNS)) {
    if (regex.test(uniqueName)) return cat
  }
  return null
}

function tierMatches(uniqueName, category) {
  const tierRegex = CATEGORY_TIER_REGEX[category] ?? DEFAULT_TIER_REGEX
  return tierRegex.test(uniqueName)
}

async function main() {
  console.log(`[build-items] Fetching ${ITEMS_URL}`)
  const res = await fetch(ITEMS_URL)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const raw = await res.json()
  const items = Array.isArray(raw) ? raw : Object.values(raw)
  console.log(`[build-items] Upstream item count: ${items.length}`)

  const processed = []
  const seenMountIds = new Set()
  for (const item of items) {
    const uniqueName = item.UniqueName
    if (!uniqueName || typeof uniqueName !== 'string') continue

    // Battle mount overrides run before the @-filter — Command Mammoth only
    // exists as `...@1` in upstream, and the override provides display/search
    // synonyms that differ from the default lookup.
    const mountOverride = MOUNT_OVERRIDES[uniqueName]
    if (mountOverride) {
      const names = item.LocalizedNames
      const en = names?.['EN-US'] ?? ''
      const ko = names?.['KO-KR'] ?? ''
      const ja = names?.['JA-JP'] ?? ''
      processed.push({
        u: uniqueName,
        c: 'mount',
        e: [en, mountOverride.d, uniqueName].join(' ').toLowerCase(),
        k: [ko, mountOverride.d, mountOverride.kExtra].join(' ').toLowerCase(),
        j: ja ? ja.toLowerCase() : '',
        d: mountOverride.d,
        dj: ja || en || uniqueName,
        de: en || uniqueName,
      })
      seenMountIds.add(uniqueName)
      continue
    }

    const category = categoryOf(uniqueName)
    if (!category) continue
    if (!tierMatches(uniqueName, category)) continue
    // Enchantment variants are suffixed `@1`/`@2`/`@3` — they share a display
    // name with the base item and would dedupe badly in the picker. Mounts are
    // exempt: several unique mounts (Swiftclaw, Rageclaw, Spectral Bonehorse,
    // Morgana Nightmare, Caerleon Cottontail) only exist as @1 variants with
    // no base form, and no mount has both base and @ forms upstream.
    if (category !== 'mount' && uniqueName.includes('@')) continue
    const names = item.LocalizedNames
    if (!names || typeof names !== 'object') continue
    const en = names['EN-US']
    const ko = names['KO-KR']
    const ja = names['JA-JP']
    if (!en && !ko && !ja) continue
    processed.push({
      u: uniqueName,
      c: category,
      // Precomputed lowercase fields skip work on every search keystroke.
      e: en ? en.toLowerCase() : '',
      k: ko ? ko.toLowerCase() : '',
      j: ja ? ja.toLowerCase() : '',
      // Display name prefers Korean, falls back to English, then raw id.
      d: ko || en || uniqueName,
      // Japanese display prefers JA, then EN, then raw id. Serves ja locale.
      dj: ja || en || uniqueName,
      // English display prefers EN, falls back to raw id. Serves en locale.
      de: en || uniqueName,
    })
  }

  const missingMounts = Object.keys(MOUNT_OVERRIDES).filter((id) => !seenMountIds.has(id))
  if (missingMounts.length > 0) {
    console.warn(`[build-items] Missing mounts from upstream: ${missingMounts.join(', ')}`)
  }

  const totalMounts = processed.filter((p) => p.c === 'mount').length
  console.log(
    `[build-items] Kept ${processed.length} items (${totalMounts} mounts total, ${seenMountIds.size} from overrides) after filter`,
  )

  const here = dirname(fileURLToPath(import.meta.url))
  const outPath = resolve(here, '..', 'src', 'data', 'albion-items.json')
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(processed))
  console.log(`[build-items] Wrote ${outPath}`)
}

main().catch((e) => {
  console.error('[build-items] Failed:', e)
  process.exit(1)
})
