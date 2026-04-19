#!/usr/bin/env node
// Parses Albion's items.xml and emits src/data/albion-item-spells.json —
// a flat map from item uniqueName to the list of spell uniqueNames the
// item can socket (active + passive, merged).
//
// Why: Albion weapons/armor each carry an inherent craftingspelllist. The
// picker needs that pool so members only choose from spells the equipment
// actually grants, instead of fuzzy-searching the entire 8800-spell catalog.
//
// Data shape notes (from items.xml):
// - <weapon> and <equipmentitem> elements have uniquename="TX_..." attrs.
// - Each contains <craftingspelllist> with either:
//     (a) inline <craftspell uniquename="..." slots="..." /> children, or
//     (b) reference="TX_BASE" pointing at another item's list.
// - Higher tiers typically reference the base tier (T5+_MAIN_MACE -> T4_MAIN_MACE).
// - Enchantment variants (@1/@2/...) do NOT appear as standalone elements;
//   lookups strip the @N suffix at runtime before hitting this map.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ITEMS_XML_URL = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.xml'

// Some upstream items reference a base that itself references another base
// (rare, but seen in mount/tool chains). Cap depth so a broken chain can't
// infinite-loop the build.
const MAX_REFERENCE_DEPTH = 8

// Matches any element that carries uniquename="..." and a craftingspelllist
// child. We only care about equipment that can slot spells, so we don't scan
// <mount> or consumable elements.
//
// Using multiline regex to grab the whole element block between the opening
// tag's uniquename attribute and the matching close tag of the element.
// items.xml is ~10MB but well-formed and regular enough that regex scanning
// is faster and dep-free compared to pulling in an XML parser.

// One capture group per element kind — same body shape but different tags.
const ITEM_ELEMENT_RE =
  /<(weapon|equipmentitem)\s+([^>]*?uniquename="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g

const CRAFTING_LIST_RE = /<craftingspelllist(\s+reference="([^"]+)")?\s*(\/>|>([\s\S]*?)<\/craftingspelllist>)/
const CRAFTSPELL_RE = /<craftspell\s+([^>/]*?)\/>/g
const ATTR_RE = /(\w+)="([^"]*)"/g

function parseAttrs(attrString) {
  const attrs = {}
  let m
  ATTR_RE.lastIndex = 0
  while ((m = ATTR_RE.exec(attrString)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

// First pass: gather raw spell-list data for each item.
// { explicit: string[] } OR { reference: 'TX_BASE' } OR null (no list).
function collectRawLists(xml) {
  const raw = new Map()
  let m
  ITEM_ELEMENT_RE.lastIndex = 0
  while ((m = ITEM_ELEMENT_RE.exec(xml)) !== null) {
    const uniqueName = m[3]
    const body = m[4]
    const listMatch = CRAFTING_LIST_RE.exec(body)
    CRAFTING_LIST_RE.lastIndex = 0
    if (!listMatch) continue

    const refAttr = listMatch[2]
    const innerBody = listMatch[4]

    if (refAttr) {
      raw.set(uniqueName, { reference: refAttr })
      continue
    }

    if (!innerBody) {
      // Self-closing <craftingspelllist/> with no reference — treat as empty.
      raw.set(uniqueName, { explicit: [] })
      continue
    }

    const spells = []
    const seen = new Set()
    let sm
    CRAFTSPELL_RE.lastIndex = 0
    while ((sm = CRAFTSPELL_RE.exec(innerBody)) !== null) {
      const attrs = parseAttrs(sm[1])
      const spellName = attrs.uniquename
      if (!spellName || seen.has(spellName)) continue
      seen.add(spellName)
      spells.push(spellName)
    }
    raw.set(uniqueName, { explicit: spells })
  }
  return raw
}

// Second pass: resolve reference chains. If a reference target is missing,
// we log and drop the item — better to surface the data issue than to ship
// a half-filled pool.
function resolveAll(raw) {
  const resolved = new Map()
  const unresolved = []

  function resolve(name, depth) {
    if (resolved.has(name)) return resolved.get(name)
    if (depth > MAX_REFERENCE_DEPTH) return null
    const entry = raw.get(name)
    if (!entry) return null
    if (entry.explicit) {
      resolved.set(name, entry.explicit)
      return entry.explicit
    }
    const target = resolve(entry.reference, depth + 1)
    if (target) {
      resolved.set(name, target)
      return target
    }
    return null
  }

  for (const name of raw.keys()) {
    const result = resolve(name, 0)
    if (!result) unresolved.push(name)
  }

  return { resolved, unresolved }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const cacheDir = resolve(here, '..', '.cache')
  const cachePath = resolve(cacheDir, 'items.xml')

  let xml
  if (process.env.AO_ITEMS_XML) {
    console.log(`[build-item-spells] Using local items.xml from ${process.env.AO_ITEMS_XML}`)
    xml = await readFile(process.env.AO_ITEMS_XML, 'utf8')
  } else {
    console.log(`[build-item-spells] Fetching ${ITEMS_XML_URL}`)
    const res = await fetch(ITEMS_XML_URL)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
    xml = await res.text()
    try {
      await mkdir(cacheDir, { recursive: true })
      await writeFile(cachePath, xml)
    } catch {
      // Cache is best-effort — not fatal.
    }
  }

  console.log(`[build-item-spells] items.xml size: ${(xml.length / 1024 / 1024).toFixed(1)}MB`)

  const raw = collectRawLists(xml)
  console.log(`[build-item-spells] Items with craftingspelllist: ${raw.size}`)

  const { resolved, unresolved } = resolveAll(raw)
  if (unresolved.length > 0) {
    console.warn(
      `[build-item-spells] ${unresolved.length} items had unresolvable references (dropped):`,
      unresolved.slice(0, 5).join(', ') + (unresolved.length > 5 ? '...' : ''),
    )
  }

  // Only emit items whose pool has at least one spell — an empty pool is
  // indistinguishable from "no mapping" on the UI side and just bloats the
  // bundle.
  const map = {}
  let emitted = 0
  for (const [name, spells] of resolved) {
    if (!spells || spells.length === 0) continue
    map[name] = spells
    emitted++
  }
  console.log(`[build-item-spells] Emitting ${emitted} item→spell mappings`)

  const outPath = resolve(here, '..', 'src', 'data', 'albion-item-spells.json')
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(map))
  const outSize = JSON.stringify(map).length
  console.log(`[build-item-spells] Wrote ${outPath} (${(outSize / 1024).toFixed(1)}KB)`)
}

main().catch((e) => {
  console.error('[build-item-spells] Failed:', e)
  process.exit(1)
})
