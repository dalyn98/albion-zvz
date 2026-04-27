#!/usr/bin/env node
// Fetches the full items.json (root, not formatted/) which carries
// craftingrequirements for every craftable item, and writes a trimmed
// recipe bundle under src/data/albion-recipes.json.
//
// Why a separate file from build-items.mjs: the formatted/items.json bundle
// (~50KB after trim) doesn't have crafting data — only display names. The
// full items.json is ~17MB and we only want a tiny slice (recipes for the
// gear categories that appear in death logs). Keeping these scripts split
// avoids dragging the heavy fetch into the items pipeline.
//
// Output schema (flat dict keyed by full item id including @ suffix):
//   {
//     "T4_MAIN_SWORD":      { silver, focus, materials: [{id, count}], isArtifact },
//     "T4_MAIN_SWORD@1":    { ... },
//     "T4_MAIN_SWORD@2":    { ... },
//     ...
//   }
//
// Materials that include "ARTEFACT" mark the item as artifact-tier — those
// require a special crafting station and are flagged so the regear claim
// flow can auto-fall-back to silver mode.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ITEMS_URL = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json'

// Same gear scope as build-items.mjs. Mounts/food/potions are intentionally
// omitted — guild crafting regear is for equipment that drops in death logs.
const GEAR_PATTERNS = [
  /^T[4-8]_(MAIN|2H)_/,
  /^T[4-8]_OFF_/,
  /^T[4-8]_HEAD_/,
  /^T[4-8]_ARMOR_/,
  /^T[4-8]_SHOES_/,
  /^T[4-8]_CAPE(ITEM)?($|_|@)/,
  /^T[4-8]_BAG($|@)/,
]

function isGearId(uniqueName) {
  return GEAR_PATTERNS.some((re) => re.test(uniqueName))
}

function asArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function extractRecipe(req) {
  // craftingrequirements may be a single object or array (xml→json artefact)
  const node = Array.isArray(req) ? req[0] : req
  if (!node || typeof node !== 'object') return null
  const resources = asArray(node.craftresource)
  const materials = []
  let isArtifact = false
  for (const r of resources) {
    const id = r['@uniquename']
    const countRaw = r['@count']
    if (typeof id !== 'string') continue
    const count = Number(countRaw)
    if (!Number.isFinite(count) || count <= 0) continue
    if (id.includes('ARTEFACT')) isArtifact = true
    materials.push({ id, count: Math.trunc(count) })
  }
  if (materials.length === 0) return null
  const silver = Number(node['@silver'] ?? 0) || 0
  const focus = Number(node['@craftingfocus'] ?? 0) || 0
  return {
    silver: Math.trunc(silver),
    focus: Math.trunc(focus),
    materials,
    isArtifact,
  }
}

function processItem(item, out) {
  const uniqueName = item['@uniquename']
  if (typeof uniqueName !== 'string') return
  if (!isGearId(uniqueName)) return

  const baseRecipe = extractRecipe(item.craftingrequirements)
  if (baseRecipe) out[uniqueName] = baseRecipe

  // enchantments[] contains per-level recipes (level 1..4). Each one carries
  // its own craftingrequirements (with leveled materials like T4_METALBAR_LEVEL1).
  const enchObj = item.enchantments
  if (enchObj && typeof enchObj === 'object') {
    const enchList = asArray(enchObj.enchantment)
    for (const ench of enchList) {
      if (!ench || typeof ench !== 'object') continue
      const level = Number(ench['@enchantmentlevel'])
      if (!Number.isFinite(level) || level < 1) continue
      const recipe = extractRecipe(ench.craftingrequirements)
      if (recipe) out[`${uniqueName}@${Math.trunc(level)}`] = recipe
    }
  }
}

async function main() {
  console.log(`[build-recipes] Fetching ${ITEMS_URL}`)
  const res = await fetch(ITEMS_URL)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const raw = await res.json()
  const root = raw?.items
  if (!root || typeof root !== 'object') throw new Error('Unexpected root shape')

  const out = {}
  // Categories that contain craftable gear. Skip non-equipment buckets.
  const buckets = ['weapon', 'equipmentitem']
  for (const bucket of buckets) {
    const list = asArray(root[bucket])
    console.log(`[build-recipes] Processing ${bucket}: ${list.length}`)
    for (const item of list) processItem(item, out)
  }

  const total = Object.keys(out).length
  const artifacts = Object.values(out).filter((r) => r.isArtifact).length
  console.log(
    `[build-recipes] Wrote ${total} recipes (${artifacts} artifact-flagged)`,
  )

  const here = dirname(fileURLToPath(import.meta.url))
  const outPath = resolve(here, '..', 'src', 'data', 'albion-recipes.json')
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(out))
  console.log(`[build-recipes] Wrote ${outPath}`)
}

main().catch((e) => {
  console.error('[build-recipes] Failed:', e)
  process.exit(1)
})
