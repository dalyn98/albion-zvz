#!/usr/bin/env node
// Parses Albion's spells.xml + items.xml and emits
// src/data/albion-spell-cooldowns.json — a compact lookup that lets the UI
// show effective E-slot cooldowns after leather armor passives and food
// buffs stack with diminishing returns.
//
// Emitted shape:
//   {
//     spells:    { <spellName>: { baseCd: number } }     // activespell recastdelay > 0
//     modifiers: { <spellName>: { cdr: number } }         // passive/food magiccooldownreduction
//     foodSpell: { <foodItemName>: <consumespell> }       // food item → buff spell
//   }
//
// Why separate from albion-item-spells: that file drives the spell *picker*
// (which spells a weapon can slot). This file drives *runtime math* (CD after
// modifiers). They share no keys and have different update cadences.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SPELLS_XML_URL = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/spells.xml'
const ITEMS_XML_URL = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.xml'

const ATTR_RE = /(\w+)="([^"]*)"/g

function parseAttrs(attrString) {
  const attrs = {}
  ATTR_RE.lastIndex = 0
  let m
  while ((m = ATTR_RE.exec(attrString)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

// <activespell ...>...</activespell> — body holds buffovertime for foods.
const ACTIVESPELL_RE = /<activespell\s+([^>]*?)>([\s\S]*?)<\/activespell>/g
// Some activespells self-close; they carry only the recastdelay on the tag.
const ACTIVESPELL_SELFCLOSE_RE = /<activespell\s+([^>]*?)\/>/g
const PASSIVESPELL_RE = /<passivespell\s+([^>]*?)>([\s\S]*?)<\/passivespell>/g

// buffovertime / buff elements inside an activespell or passivespell body.
// We only care about type="magiccooldownreduction" — Albion's stat for spell CDR.
const CDR_BUFF_RE = /<buff(?:overtime)?\s+[^>]*?type="magiccooldownreduction"[^>]*?value="([\d\.]+)"/g

// <consumableitem uniquename="..." consumespell="..." /> — food items reference
// their buff spell here. We keep only T4-T8 meal items (matches what the picker
// already filters to).
const CONSUMABLE_RE =
  /<consumableitem\s+([^>]*uniquename="(T[4-8]_MEAL_[^"]+)"[^>]*)/g

function extractSpells(xml) {
  const spells = {}
  const modifiers = {}

  // Pass 1: activespells with body. These carry the base recastdelay AND may
  // carry a CDR buff (food omelettes apply cdr via buffovertime inside body).
  ACTIVESPELL_RE.lastIndex = 0
  let m
  while ((m = ACTIVESPELL_RE.exec(xml)) !== null) {
    const attrs = parseAttrs(m[1])
    const name = attrs.uniquename
    if (!name) continue
    const recast = Number(attrs.recastdelay)
    if (Number.isFinite(recast) && recast > 0) {
      spells[name] = { baseCd: recast }
    }
    // Only capture activespell CDR if it's a food buff — other activespells
    // with a magiccooldownreduction buff are triggered abilities (SPRINT_CD_
    // REDUCTION grants 33% CDR for 5s on cast) and must not be counted as
    // always-on gear modifiers. Passive always-on CDR lives in <passivespell>.
    if (!name.startsWith('FOOD_')) continue
    CDR_BUFF_RE.lastIndex = 0
    const buffMatch = CDR_BUFF_RE.exec(m[2])
    if (buffMatch) {
      const cdr = Number(buffMatch[1])
      if (Number.isFinite(cdr) && cdr > 0) {
        modifiers[name] = { cdr }
      }
    }
  }

  // Pass 2: self-closing activespells (no body, cooldown only).
  ACTIVESPELL_SELFCLOSE_RE.lastIndex = 0
  while ((m = ACTIVESPELL_SELFCLOSE_RE.exec(xml)) !== null) {
    const attrs = parseAttrs(m[1])
    const name = attrs.uniquename
    if (!name || spells[name]) continue
    const recast = Number(attrs.recastdelay)
    if (Number.isFinite(recast) && recast > 0) {
      spells[name] = { baseCd: recast }
    }
  }

  // Pass 3: passivespells — leather armor CDR buffs live here as static <buff>.
  PASSIVESPELL_RE.lastIndex = 0
  while ((m = PASSIVESPELL_RE.exec(xml)) !== null) {
    const attrs = parseAttrs(m[1])
    const name = attrs.uniquename
    if (!name) continue
    CDR_BUFF_RE.lastIndex = 0
    const buffMatch = CDR_BUFF_RE.exec(m[2])
    if (!buffMatch) continue
    const cdr = Number(buffMatch[1])
    if (Number.isFinite(cdr) && cdr > 0) {
      modifiers[name] = { cdr }
    }
  }
  // Self-closing passivespells can't carry <buff> children, so nothing to collect from them.

  return { spells, modifiers }
}

function extractFoodConsumeSpell(itemsXml) {
  const map = {}
  CONSUMABLE_RE.lastIndex = 0
  let m
  while ((m = CONSUMABLE_RE.exec(itemsXml)) !== null) {
    const attrs = parseAttrs(m[1])
    const name = attrs.uniquename
    const spell = attrs.consumespell
    if (!name || !spell) continue
    map[name] = spell

    // Enchanted food variants (T4_MEAL_SOUP@1, @2, @3) have their own
    // consumespell nested in <enchantments><enchantment .../>. Capture those
    // by scanning forward from this match to the closing </consumableitem>.
    // Cheap bounded slice — these blocks are <2KB each.
    const tailStart = m.index
    const tailEnd = itemsXml.indexOf('</consumableitem>', tailStart)
    if (tailEnd === -1) continue
    const block = itemsXml.slice(tailStart, tailEnd)
    const ENCHANT_RE =
      /<enchantment\s+([^>]*enchantmentlevel="(\d+)"[^>]*consumespell="([^"]+)"[^>]*)/g
    let em
    while ((em = ENCHANT_RE.exec(block)) !== null) {
      const lvl = em[2]
      const espell = em[3]
      map[`${name}@${lvl}`] = espell
    }
  }
  return map
}

async function loadXml(envVar, url, cachePath, label) {
  if (process.env[envVar]) {
    console.log(`[build-spell-cooldowns] Using local ${label} from ${process.env[envVar]}`)
    return readFile(process.env[envVar], 'utf8')
  }
  if (existsSync(cachePath)) {
    console.log(`[build-spell-cooldowns] Using cached ${label} at ${cachePath}`)
    return readFile(cachePath, 'utf8')
  }
  console.log(`[build-spell-cooldowns] Fetching ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const text = await res.text()
  try {
    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, text)
  } catch {
    // Cache is best-effort.
  }
  return text
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url))
  const cacheDir = resolve(here, '..', '.cache')
  const spellsCache = resolve(cacheDir, 'spells.xml')
  const itemsCache = resolve(cacheDir, 'items.xml')

  const spellsXml = await loadXml('AO_SPELLS_XML', SPELLS_XML_URL, spellsCache, 'spells.xml')
  const itemsXml = await loadXml('AO_ITEMS_XML', ITEMS_XML_URL, itemsCache, 'items.xml')

  console.log(
    `[build-spell-cooldowns] spells.xml ${(spellsXml.length / 1024 / 1024).toFixed(1)}MB, items.xml ${(itemsXml.length / 1024 / 1024).toFixed(1)}MB`,
  )

  const { spells, modifiers } = extractSpells(spellsXml)
  const foodSpell = extractFoodConsumeSpell(itemsXml)

  console.log(
    `[build-spell-cooldowns] spells(base CD): ${Object.keys(spells).length}, modifiers(CDR): ${Object.keys(modifiers).length}, food→spell: ${Object.keys(foodSpell).length}`,
  )

  const out = { spells, modifiers, foodSpell }
  const outPath = resolve(here, '..', 'src', 'data', 'albion-spell-cooldowns.json')
  await mkdir(dirname(outPath), { recursive: true })
  const json = JSON.stringify(out)
  await writeFile(outPath, json)
  console.log(
    `[build-spell-cooldowns] Wrote ${outPath} (${(json.length / 1024).toFixed(1)}KB)`,
  )
}

main().catch((e) => {
  console.error('[build-spell-cooldowns] Failed:', e)
  process.exit(1)
})
