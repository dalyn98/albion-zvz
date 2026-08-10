#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { compile } from '@mdx-js/mdx'
import {
  localizeProtectedValue,
  normalizeProtectedTokens,
} from './message-translation-job.mjs'
import { applyMessageReviewRules } from './message-review-rules.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const DOCS_DIRECTORY = resolve(ROOT, 'src/app/(public-shell)/public/(marketing)/docs')
const CATALOG_PATH = process.env.AGM_DOCS_TRANSLATION_CATALOG
  ? resolve(process.env.AGM_DOCS_TRANSLATION_CATALOG)
  : resolve(ROOT, 'src/content/docs-translations.json')
const REVIEWED_OVERRIDES_DIRECTORY = process.env.AGM_DOCS_REVIEWED_OVERRIDES_DIR
  ? resolve(process.env.AGM_DOCS_REVIEWED_OVERRIDES_DIR)
  : resolve(ROOT, 'src/content/docs-reviewed-overrides')
const SOURCE_LOCALE = 'ko'
const TARGET_LOCALES = new Set([
  'ja', 'en', 'zh', 'zh-Hant', 'fr', 'de', 'es-ES', 'es-419',
  'pt-BR', 'pt-PT', 'pl', 'ru', 'it', 'id', 'ar', 'tr',
])

const PROTECTED_PATTERNS = [
  /(?:자동 리기어|수동 리기어|제작 리기어|리기어|밤스쿼드|블랙존|빌드표|콜러|킬보드|갱킹|파티|슬롯|봇)/g,
  /\b(?:Albion Online|AlbionGuildManager|Albion|Auto[- ]?Regear|Manual Regears?|Crafted Regears?|Death Regears?|Tracked-Death Regears?|Event Regear|Guest Regear|Eligible Regear|Regear Windows?|Battle Mounts?|Black Zones?|Bomb Squads?|Build Sheets?|Callers?|Discord|Fame Farm(?:ing)?|Gear|Ganks?|Ganking|Kill Fame|Killboards?|Small Scale|Bots?|Part(?:y|ies)|Slots?|Loadouts?|Claims?|Officers?|Stock|Builds?|ZvZ|K\/D|AODP|AGM|regears?|CTA|IP|BZ|PvP|PvE|DPS|AoE|CC|GvG|HCE|shot-?callers?)\b/gi,
  /\{[^{}]+\}/g,
  /`[^`]+`/g,
  /https?:\/\/[^\s)\]}]+/g,
  /\/(?:agm|setup)(?:\s+[A-Za-z0-9_-]+)*/gi,
]

function usage() {
  console.error(`Usage: node scripts/docs-translation-job.mjs <prepare|apply|audit> <${[...TARGET_LOCALES].join('|')}>`)
  process.exit(2)
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
  if (/__AGM_TOKEN_\d{4}__/.test(text)) {
    throw new Error(`${source}: unexpected protected token remained`)
  }
  return text.trim()
}

async function listMdxFiles(directory = DOCS_DIRECTORY) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return listMdxFiles(path)
    return entry.name.endsWith('.mdx') ? [path] : []
  }))
  return nested.flat().sort()
}

function containsKorean(text) {
  return /[가-힣]/.test(text)
}

async function collectSourceStrings() {
  const sources = new Map()
  for (const path of await listMdxFiles()) {
    const input = await readFile(path, 'utf8')
    const file = relative(DOCS_DIRECTORY, path)
    const add = (source, kind) => {
      const normalized = source.trim()
      if (!normalized || !containsKorean(normalized) || sources.has(normalized)) return
      sources.set(normalized, { source: normalized, file, kind })
    }

    await compile(input, {
      remarkPlugins: [() => (tree) => {
        const visit = (node) => {
          if (node?.type === 'text' && typeof node.value === 'string') add(node.value, 'markdown')
          if (Array.isArray(node?.children)) node.children.forEach(visit)
        }
        visit(tree)
      }],
    })

    for (const match of input.matchAll(/(['"])([^'"\n]*[가-힣][^'"\n]*)\1/g)) {
      add(match[2], 'jsx-string')
    }
  }
  return [...sources.values()]
}

function digestJob(locale, items) {
  return createHash('sha256').update(JSON.stringify({ locale, items })).digest('hex')
}

function paths(locale) {
  const temporaryDirectory = process.env.AGM_TRANSLATION_TMP_DIR || '/tmp'
  const stem = resolve(temporaryDirectory, `agm-docs-translation-${locale}`)
  return {
    job: `${stem}-job.json`,
    result: `${stem}-result.json`,
    error: `${stem}-error.txt`,
  }
}

async function readReviewedOverrides(locale) {
  // Critical Spanish prose is deliberately neutral and reviewed once. The
  // remaining catalog still comes from the region-specific translation model.
  const overrideLocales = locale === 'es-419' ? ['es-ES', 'es-419'] : [locale]
  const merged = {}
  for (const overrideLocale of overrideLocales) {
    const path = resolve(REVIEWED_OVERRIDES_DIRECTORY, `${overrideLocale}.json`)
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'))
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error(`${overrideLocale}: docs reviewed overrides must be a JSON object`)
      }
      Object.assign(merged, parsed)
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') continue
      throw error
    }
  }
  return merged
}

async function prepare(locale) {
  const outputPaths = paths(locale)
  const sources = await collectSourceStrings()
  let translationSourceLocale = SOURCE_LOCALE
  let englishTranslations = null
  if (locale !== 'en') {
    const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'))
    englishTranslations = catalog.locales?.en ?? null
    const missingEnglish = sources
      .map(({ source }) => source)
      .filter((source) => !englishTranslations?.[source] || containsKorean(englishTranslations[source]))
    if (missingEnglish.length > 0) {
      throw new Error(
        `${locale}: complete the English docs catalog before using it as the translation pivot; `
        + `missing or Korean: ${missingEnglish.slice(0, 3).join(' | ')}`,
      )
    }
    translationSourceLocale = 'en'
  }
  const items = sources.map((entry, index) => {
    const translationSource = englishTranslations?.[entry.source] ?? entry.source
    return {
      id: String(index),
      ...entry,
      translationSource,
      ...protectText(translationSource),
    }
  })
  const jobDigest = digestJob(locale, items)
  await writeFile(
    outputPaths.job,
    `${JSON.stringify({ locale, translationSourceLocale, jobDigest, items }, null, 2)}\n`,
  )
  console.log(JSON.stringify({
    locale,
    translationSourceLocale,
    jobs: items.length,
    jobDigest,
    ...outputPaths,
  }))
}

async function apply(locale) {
  const outputPaths = paths(locale)
  const [job, result, catalog, reviewedOverrides] = await Promise.all([
    readFile(outputPaths.job, 'utf8').then(JSON.parse),
    readFile(outputPaths.result, 'utf8').then(JSON.parse),
    readFile(CATALOG_PATH, 'utf8').then(JSON.parse),
    readReviewedOverrides(locale),
  ])
  const expectedDigest = digestJob(job.locale, job.items)
  if (job.locale !== locale || job.jobDigest !== expectedDigest) {
    throw new Error(`${locale}: docs translation job digest is missing or invalid`)
  }
  if (result.locale !== locale || result.jobDigest !== job.jobDigest) {
    throw new Error(`${locale}: docs translation result does not match the prepared job`)
  }
  if (result.items.length !== job.items.length) {
    throw new Error(`${locale}: expected ${job.items.length} results, received ${result.items.length}`)
  }
  const resultById = new Map(result.items.map((item) => [item.id, item.text]))
  if (resultById.size !== result.items.length) throw new Error(`${locale}: duplicate result ids`)

  const translations = {}
  const sourceSet = new Set(job.items.map((item) => item.source))
  for (const [source, translated] of Object.entries(reviewedOverrides)) {
    if (!sourceSet.has(source)) {
      throw new Error(`${locale}: stale docs reviewed override source: ${source}`)
    }
    if (typeof translated !== 'string' || !translated.trim()) {
      throw new Error(`${locale}: empty docs reviewed override for: ${source}`)
    }
  }
  for (const item of job.items) {
    const translated = resultById.get(item.id)
    if (typeof translated !== 'string' || !translated.trim()) {
      throw new Error(`${locale}: missing docs translation for ${item.source}`)
    }
    translations[item.source] = reviewedOverrides[item.source]
      ?? applyMessageReviewRules(
        locale,
        item.translationSource,
        restoreText(translated, item.tokenValues, item.source, locale),
      )
  }

  catalog.sourceLocale = SOURCE_LOCALE
  catalog.sourceDigest = createHash('sha256')
    .update(JSON.stringify(job.items.map(({ source }) => source)))
    .digest('hex')
  catalog.sourceStrings = job.items.length
  catalog.locales ??= {}
  catalog.locales[locale] = translations
  await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`)
  console.log(JSON.stringify({
    locale,
    applied: Object.keys(translations).length,
    reviewedOverrides: Object.keys(reviewedOverrides).length,
    target: CATALOG_PATH,
  }))
}

async function audit(locale) {
  const [sources, catalog] = await Promise.all([
    collectSourceStrings(),
    readFile(CATALOG_PATH, 'utf8').then(JSON.parse),
  ])
  const translations = catalog.locales?.[locale] ?? {}
  const missing = sources.map(({ source }) => source).filter((source) => !translations[source])
  const koreanRemaining = Object.entries(translations)
    .filter(([, translated]) => containsKorean(translated))
    .map(([source]) => source)
  console.log(JSON.stringify({
    locale,
    expected: sources.length,
    translated: Object.keys(translations).length,
    missing: missing.slice(0, 20),
    koreanRemaining: koreanRemaining.slice(0, 20),
  }, null, 2))
  if (missing.length || koreanRemaining.length) process.exitCode = 1
}

const [command, locale] = process.argv.slice(2)
if (!['prepare', 'apply', 'audit'].includes(command) || !TARGET_LOCALES.has(locale)) usage()
if (command === 'prepare') await prepare(locale)
if (command === 'apply') await apply(locale)
if (command === 'audit') await audit(locale)
