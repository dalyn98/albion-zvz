#!/usr/bin/env node
// PostToolUse:Edit|Write — when src/messages/{ko,ja,en,zh}.json is touched,
// verify keys + placeholder variables match across the 4 locales.
// Exit 2 with stderr → agent sees the diff and fixes the gap.

'use strict'

const fs = require('fs')
const path = require('path')

const chunks = []
process.stdin.on('data', (c) => chunks.push(c))
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    process.exit(0)
  }
  const filePath = (payload.tool_input && payload.tool_input.file_path) || ''
  if (!/\/src\/messages\/(ko|ja|en|zh)\.json$/.test(filePath)) process.exit(0)

  const projectRoot = path.resolve(__dirname, '..', '..')
  const locales = ['ko', 'ja', 'en', 'zh']
  let docs
  try {
    docs = Object.fromEntries(
      locales.map((l) => [l, JSON.parse(fs.readFileSync(path.join(projectRoot, 'src', 'messages', l + '.json'), 'utf8'))])
    )
  } catch (e) {
    console.error(`[i18n-parity] failed to read messages JSON: ${e.message}`)
    process.exit(0)
  }

  const flat = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? flat(v, prefix + k + '.')
        : [[prefix + k, v]]
    )

  // super-admin/* is allowed ko-only per project rule.
  const skip = (k) => k.startsWith('superAdmin.')

  const keyMaps = Object.fromEntries(
    locales.map((l) => [l, new Map(flat(docs[l]).filter(([k]) => !skip(k)))])
  )

  const allKeys = new Set()
  for (const m of Object.values(keyMaps)) for (const k of m.keys()) allKeys.add(k)

  const missing = []
  for (const k of allKeys) {
    for (const l of locales) {
      if (!keyMaps[l].has(k)) missing.push(`${l}: ${k}`)
    }
  }

  const vars = (s) =>
    typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',') : ''
  const placeholderMismatch = []
  for (const k of allKeys) {
    const sigs = locales.map((l) => vars(keyMaps[l].get(k)))
    if (sigs.every((s) => s === sigs[0])) continue
    placeholderMismatch.push(`${k}  →  ko:[${sigs[0]}] ja:[${sigs[1]}] en:[${sigs[2]}] zh:[${sigs[3]}]`)
  }

  if (missing.length === 0 && placeholderMismatch.length === 0) {
    console.log(`[i18n-parity] OK — ${allKeys.size} keys aligned across ko/ja/en/zh (superAdmin.* excluded).`)
    process.exit(0)
  }

  let msg = `[i18n-parity] MISMATCH after editing ${path.basename(filePath)}:\n`
  if (missing.length) msg += '  missing keys:\n' + missing.slice(0, 20).map((m) => '    • ' + m).join('\n') + (missing.length > 20 ? `\n    … and ${missing.length - 20} more` : '') + '\n'
  if (placeholderMismatch.length) msg += '  placeholder var mismatch:\n' + placeholderMismatch.slice(0, 10).map((m) => '    • ' + m).join('\n') + '\n'
  msg += '→ Add the missing keys / align placeholders so the 4 files stay equal. superAdmin.* is the only allowed ko-only exception.'
  console.error(msg)
  process.exit(2)
})
