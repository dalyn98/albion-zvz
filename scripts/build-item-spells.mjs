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
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ITEMS_XML_URL = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.xml'
const FETCH_TIMEOUT_MS = 30_000
const FETCH_RETRIES = 1

async function fetchTextWithTimeout(url) {
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: ctl.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      return await res.text()
    } catch (e) {
      clearTimeout(timer)
      if (attempt === FETCH_RETRIES) throw e
      console.warn(`[build-item-spells] fetch attempt ${attempt + 1} failed (${e.message}), retrying in 1.5s`)
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

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
const REMOVESPELL_RE = /<removespell\s+([^>/]*?)\/>/g
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

// Each entry is { name, slot, type }:
// - `type` is derived from the uniqueName prefix: PASSIVE_* → 'passive',
//   everything else → 'active'. items.xml has no explicit active/passive
//   attribute, so we lean on the naming convention (PASSIVE_ prefix is
//   consistent across 200+ passive spells in the dump).
// - `slot` is the integer from `slots="N"` or null if absent. The meaning
//   differs by item type: weapons use slots=1/2/3 to mark active Q/W/E
//   position; armor/head/shoes use slots=1/2 to mark which passive slot
//   a passive goes into. Consumers interpret it via (type, slot) together.
// removespell doesn't carry slot info but only needs the name to match,
// so callers passing REMOVESPELL_RE can ignore slot/type.
function extractSpellEntries(innerBody, pattern) {
  if (!innerBody) return []
  const out = []
  const seen = new Set()
  pattern.lastIndex = 0
  let m
  while ((m = pattern.exec(innerBody)) !== null) {
    const attrs = parseAttrs(m[1])
    const spellName = attrs.uniquename
    if (!spellName || seen.has(spellName)) continue
    seen.add(spellName)
    const slotRaw = attrs.slots
    const slot = slotRaw === undefined || slotRaw === '' ? null : Number(slotRaw)
    const type = spellName.startsWith('PASSIVE') ? 'passive' : 'active'
    out.push({
      name: spellName,
      slot: Number.isFinite(slot) ? slot : null,
      type,
    })
  }
  return out
}

// First pass: gather raw spell-list data for each item. Entries are one of:
//   { explicit: string[] }                       — direct list, no inheritance
//   { reference: 'TX_BASE', adds, removes }      — inherit base, then modify
// Artifacts (hell/crystal/morgana/avalon/keeper) use the reference+adds+removes
// form: they inherit the base weapon's pool and swap in their signature spell
// (e.g. T4_MAIN_MACE_HELL removes MACELEAP, adds SHRINKINGSMASH).
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
      // Reference, optionally with an override body of craftspell/removespell.
      raw.set(uniqueName, {
        reference: refAttr,
        adds: extractSpellEntries(innerBody, CRAFTSPELL_RE),
        removes: extractSpellEntries(innerBody, REMOVESPELL_RE).map((e) => e.name),
      })
      continue
    }

    if (!innerBody) {
      raw.set(uniqueName, { explicit: [] })
      continue
    }

    raw.set(uniqueName, { explicit: extractSpellEntries(innerBody, CRAFTSPELL_RE) })
  }
  return raw
}

function applyOverrides(base, adds, removes) {
  const removeSet = new Set(removes)
  const addNames = new Set(adds.map((e) => e.name))
  // Drop anything the base provides that this item removes, AND strip any
  // base spell also named in adds — artifacts occasionally re-declare a
  // base spell; the override wins and we'd otherwise duplicate-render it.
  const kept = base.filter((e) => !removeSet.has(e.name) && !addNames.has(e.name))
  return [...kept, ...adds]
}

// Second pass: resolve reference chains. Each resolution returns a NEW array
// (overrides compose, so the parent's resolved list must not be mutated
// when a child layers removes/adds on top).
function resolveAll(raw) {
  const resolved = new Map()
  const unresolved = []

  function resolveOne(name, depth) {
    if (resolved.has(name)) return resolved.get(name)
    if (depth > MAX_REFERENCE_DEPTH) return null
    const entry = raw.get(name)
    if (!entry) return null
    if (entry.explicit) {
      resolved.set(name, entry.explicit)
      return entry.explicit
    }
    const base = resolveOne(entry.reference, depth + 1)
    if (!base) return null
    const merged = applyOverrides(base, entry.adds ?? [], entry.removes ?? [])
    resolved.set(name, merged)
    return merged
  }

  for (const name of raw.keys()) {
    const result = resolveOne(name, 0)
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
    try {
      console.log(`[build-item-spells] Fetching ${ITEMS_XML_URL}`)
      xml = await fetchTextWithTimeout(ITEMS_XML_URL)
      try {
        await mkdir(cacheDir, { recursive: true })
        await writeFile(cachePath, xml)
      } catch (cacheErr) {
        console.warn(`[build-item-spells] cache write failed (non-fatal): ${cacheErr.message}`)
      }
    } catch (e) {
      if (!existsSync(cachePath)) {
        console.error(`[build-item-spells] fetch failed and no cache available: ${e.message}`)
        throw e
      }
      console.warn(`[build-item-spells] fetch failed (${e.message}), falling back to cache ${cachePath}`)
      xml = await readFile(cachePath, 'utf8')
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

  // Derived lookup: spell uniqueName → {slot, type}. Slot/type are universal
  // per spell (same spell name has the same slot across every item that grants
  // it, per items.xml), so we can dedupe into a flat table. Needed on the
  // client to group member-facing spell displays by slot without shipping the
  // full per-item map (~700KB → ~60KB).
  const slotMap = {}
  for (const spells of resolved.values()) {
    for (const s of spells) {
      if (slotMap[s.name]) continue
      slotMap[s.name] = { slot: s.slot, type: s.type }
    }
  }
  const slotOutPath = resolve(here, '..', 'src', 'data', 'albion-spell-slots.json')
  const slotJson = JSON.stringify(slotMap)
  await writeFile(slotOutPath, slotJson)
  console.log(
    `[build-item-spells] Wrote ${slotOutPath} (${Object.keys(slotMap).length} spells, ${(slotJson.length / 1024).toFixed(1)}KB)`,
  )
}

main().catch((e) => {
  console.error('[build-item-spells] Failed:', e)
  process.exit(1)
})
