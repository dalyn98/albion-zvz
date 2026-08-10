#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import discordCommandCatalog from '../src/lib/discord-command-catalog.mjs'
import {
  localizeProtectedValue,
  normalizeProtectedTokens,
} from './message-translation-job.mjs'
import { applyMessageReviewRules } from './message-review-rules.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const CATALOG_PATH = process.env.AGM_DISCORD_TRANSLATION_CATALOG
  ? resolve(process.env.AGM_DISCORD_TRANSLATION_CATALOG)
  : resolve(ROOT, 'src/lib/discord-command-localizations.json')
const REVIEWED_OVERRIDES_DIRECTORY = process.env.AGM_DISCORD_REVIEWED_OVERRIDES_DIR
  ? resolve(process.env.AGM_DISCORD_REVIEWED_OVERRIDES_DIR)
  : resolve(ROOT, 'src/lib/discord-command-reviewed-overrides')
const TARGET_LOCALES = new Set([
  'fr', 'de', 'es-ES', 'es-419', 'pt-BR', 'pl', 'ru', 'it', 'id', 'tr',
])
const PROTECTED_PATTERNS = [
  /\b(?:Albion Online|Albion Guild Manager|Albion|Auto[- ]?Regear|Manual Regears?|Crafted Regears?|Death Regears?|Tracked-Death Regears?|Event Regear|Guest Regear|Eligible Regear|Regear Windows?|Battle Mounts?|Black Zones?|Bomb Squads?|Build Sheets?|Callers?|Discord|Fame Farm(?:ing)?|Gear|Ganks?|Ganking|Kill Fame|Killboards?|Small Scale|ZvZ|K\/D|AODP|AGM|regears?|CTA|IP|BZ|PvP|PvE|DPS|AoE|CC|GvG|HCE|shot-?callers?)\b/gi,
  /\{[^{}]+\}/g,
]

function usage() {
  console.error('Usage: node scripts/discord-command-translation-job.mjs <prepare|apply|audit> <locale>')
  process.exit(2)
}

async function readReviewedOverrides(locale) {
  try {
    return JSON.parse(
      await readFile(resolve(REVIEWED_OVERRIDES_DIRECTORY, `${locale}.json`), 'utf8'),
    )
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function collectEnglishStrings() {
  const strings = new Set()
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
      return
    }
    if (!value || typeof value !== 'object') return
    if (typeof value.description === 'string') strings.add(value.description)
    if (Array.isArray(value.choices)) {
      for (const choice of value.choices) {
        if (typeof choice.name === 'string') strings.add(choice.name)
      }
    }
    if (Array.isArray(value.options)) visit(value.options)
  }
  visit(discordCommandCatalog)
  return [...strings]
}

function protectText(source) {
  const tokenValues = []
  let text = source
  for (const pattern of PROTECTED_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const index = tokenValues.push(match) - 1
      return `__AGM_TOKEN_${String(index).padStart(4, '0')}__`
    })
  }
  return { text, tokenValues }
}

function restoreText(translated, tokenValues, source, locale) {
  let text = normalizeProtectedTokens(translated)
  const nestedTokenIndexes = new Set()
  for (const value of tokenValues) {
    for (const match of value.matchAll(/__AGM_TOKEN_(\d{4})__/g)) {
      nestedTokenIndexes.add(Number(match[1]))
    }
  }
  for (let index = tokenValues.length - 1; index >= 0; index -= 1) {
    const token = `__AGM_TOKEN_${String(index).padStart(4, '0')}__`
    if (text.split(token).length - 1 !== 1) {
      throw new Error(`${source}: protected token ${token} was changed`)
    }
    const value = nestedTokenIndexes.has(index)
      ? tokenValues[index]
      : localizeProtectedValue(tokenValues[index], locale)
    text = text.replace(token, value)
  }
  return text.trim()
}

function paths(locale) {
  const tempDirectory = process.env.AGM_TRANSLATION_TMP_DIR || '/tmp'
  const stem = resolve(tempDirectory, `agm-discord-command-translation-${locale}`)
  return {
    job: `${stem}-job.json`,
    result: `${stem}-result.json`,
    error: `${stem}-error.txt`,
  }
}

function digestJob(locale, items) {
  return createHash('sha256')
    .update(JSON.stringify({ locale, items }))
    .digest('hex')
}

async function prepare(locale) {
  const outputPaths = paths(locale)
  const items = collectEnglishStrings().map((source, index) => ({
    id: String(index),
    source,
    ...protectText(source),
  }))
  const jobDigest = digestJob(locale, items)
  await writeFile(outputPaths.job, `${JSON.stringify({ locale, jobDigest, items }, null, 2)}\n`)
  console.log(JSON.stringify({ locale, jobs: items.length, jobDigest, ...outputPaths }))
}

async function apply(locale) {
  const outputPaths = paths(locale)
  const [catalog, job, result, reviewedOverrides] = await Promise.all([
    readFile(CATALOG_PATH, 'utf8').then(JSON.parse),
    readFile(outputPaths.job, 'utf8').then(JSON.parse),
    readFile(outputPaths.result, 'utf8').then(JSON.parse),
    readReviewedOverrides(locale),
  ])
  const expectedDigest = digestJob(job.locale, job.items)
  if (job.locale !== locale || job.jobDigest !== expectedDigest) {
    throw new Error(`${locale}: Discord translation job digest is missing or invalid`)
  }
  if (result.locale !== locale || result.jobDigest !== job.jobDigest) {
    throw new Error(`${locale}: Discord translation result does not match the prepared job`)
  }
  if (result.items.length !== job.items.length) {
    throw new Error(`${locale}: expected ${job.items.length} results, received ${result.items.length}`)
  }
  const resultById = new Map(result.items.map((item) => [item.id, item.text]))
  if (resultById.size !== result.items.length) {
    throw new Error(`${locale}: Discord translation result contains duplicate ids`)
  }
  const translations = {}
  for (const item of job.items) {
    const translated = resultById.get(item.id)
    if (typeof translated !== 'string') throw new Error(`Missing result for ${item.source}`)
    const restored = applyMessageReviewRules(
      locale,
      item.source,
      restoreText(translated, item.tokenValues, item.source, locale),
    )
    if (!restored || restored.length > 100) {
      throw new Error(`${item.source}: Discord localization must be 1-100 characters`)
    }
    translations[item.source] = restored
  }
  for (const [source, reviewed] of Object.entries(reviewedOverrides)) {
    if (!translations[source]) throw new Error(`${locale}: unknown reviewed Discord source: ${source}`)
    if (typeof reviewed !== 'string' || !reviewed.trim() || reviewed.length > 100) {
      throw new Error(`${source}: reviewed Discord localization must be 1-100 characters`)
    }
    const sourceTokens = source.match(/\{[^{}]+\}/g)?.sort() ?? []
    const reviewedTokens = reviewed.match(/\{[^{}]+\}/g)?.sort() ?? []
    if (JSON.stringify(sourceTokens) !== JSON.stringify(reviewedTokens)) {
      throw new Error(`${source}: reviewed Discord placeholders do not match`)
    }
    translations[source] = reviewed
  }
  catalog[locale] = translations
  await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`)
  console.log(JSON.stringify({
    locale,
    applied: Object.keys(translations).length,
    reviewedOverrides: Object.keys(reviewedOverrides).length,
  }))
}

async function audit(locale) {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
  const expected = collectEnglishStrings()
  const translations = catalog[locale] ?? {}
  const missing = expected.filter((source) => !translations[source])
  const tooLong = Object.entries(translations)
    .filter(([, translated]) => translated.length > 100)
    .map(([source]) => source)
  console.log(JSON.stringify({ locale, expected: expected.length, translated: Object.keys(translations).length, missing, tooLong }, null, 2))
  if (missing.length || tooLong.length) process.exitCode = 1
}

const [command, locale] = process.argv.slice(2)
if (!['prepare', 'apply', 'audit'].includes(command) || !TARGET_LOCALES.has(locale)) usage()
if (command === 'prepare') await prepare(locale)
if (command === 'apply') await apply(locale)
if (command === 'audit') await audit(locale)
