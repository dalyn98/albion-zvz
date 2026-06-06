import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
} from './client-messages'

const SOURCE_ROOTS = ['src/app', 'src/components']

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(file, out)
      continue
    }
    if (/\.tsx?$/.test(entry.name)) out.push(file)
  }
  return out
}

function usedClientTranslationNamespaces(): Set<string> {
  const namespaces = new Set<string>()
  const namespacePattern = /useTranslations(?:<[^>]+>)?\(\s*(['"])(.*?)\1\s*\)/g
  for (const root of SOURCE_ROOTS) {
    for (const file of walkTsFiles(root)) {
      const source = readFileSync(file, 'utf8')
      if (!/^['"]use client['"]/m.test(source)) continue
      let match: RegExpExecArray | null
      while ((match = namespacePattern.exec(source))) {
        namespaces.add(match[2].split('.')[0])
      }
    }
  }
  return namespaces
}

describe('getClientMessages', () => {
  it('keeps every namespace referenced by client useTranslations calls', () => {
    const allowed = new Set<string>(CLIENT_MESSAGE_NAMESPACES)
    const missing = [...usedClientTranslationNamespaces()].filter((ns) => !allowed.has(ns))

    expect(missing).toEqual([])
  })

  it('filters server-only message namespaces out of the provider payload', () => {
    const messages = {
      common: { save: 'save' },
      nav: { home: 'home' },
      adminGuide: { huge: 'server only' },
      adminActionError: { serverError: 'server only' },
    }

    expect(getClientMessages(messages)).toEqual({
      common: { save: 'save' },
      nav: { home: 'home' },
    })
  })
})
