import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  APP_GATE_CLIENT_MESSAGE_NAMESPACES,
  CLIENT_MESSAGE_NAMESPACES,
  DEMO_CLIENT_MESSAGE_NAMESPACES,
  MARKETING_CLIENT_MESSAGE_NAMESPACES,
  PUBLIC_ACTIVITY_CLIENT_MESSAGE_NAMESPACES,
  PUBLIC_CLIENT_MESSAGE_NAMESPACES,
  PUBLIC_TACTIC_CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
  getAppShellClientMessages,
  getDemoClientMessages,
  getMarketingClientMessages,
  getPublicActivityClientMessages,
  getPublicClientMessages,
  getPublicTacticClientMessages,
} from './client-messages'

const SOURCE_ROOTS = ['src/app', 'src/components']
const PUBLIC_SHELL_ROOT = join('src', 'app', '(public-shell)')
const PUBLIC_PROVIDER_SCOPES = [
  {
    label: 'marketing',
    root: join(PUBLIC_SHELL_ROOT, 'public', '(marketing)'),
    namespaces: MARKETING_CLIENT_MESSAGE_NAMESPACES,
    pick: getMarketingClientMessages,
  },
  {
    label: 'demo',
    root: join(PUBLIC_SHELL_ROOT, 'demo'),
    namespaces: DEMO_CLIENT_MESSAGE_NAMESPACES,
    pick: getDemoClientMessages,
  },
  {
    label: 'public activity',
    root: join(PUBLIC_SHELL_ROOT, 'public', 'u'),
    namespaces: PUBLIC_ACTIVITY_CLIENT_MESSAGE_NAMESPACES,
    pick: getPublicActivityClientMessages,
  },
  {
    label: 'public tactic share',
    root: join(PUBLIC_SHELL_ROOT, 'tactics', 'share'),
    namespaces: PUBLIC_TACTIC_CLIENT_MESSAGE_NAMESPACES,
    pick: getPublicTacticClientMessages,
  },
] as const
const SRC_ROOT = 'src'
const SOURCE_EXTENSIONS = ['.ts', '.tsx']

function isSourceFile(file: string): boolean {
  return /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(file, out)
      continue
    }
    if (isSourceFile(entry.name)) out.push(file)
  }
  return out
}

function extractClientTranslationNamespaces(source: string): Set<string> {
  const namespaces = new Set<string>()
  const namespacePattern = /useTranslations(?:<[^>]+>)?\(\s*(['"])(.*?)\1\s*\)/g
  if (!/^['"]use client['"]/m.test(source)) return namespaces

  let match: RegExpExecArray | null
  while ((match = namespacePattern.exec(source))) {
    namespaces.add(match[2].split('.')[0])
  }
  return namespaces
}

function usedClientTranslationNamespaces(): Set<string> {
  const namespaces = new Set<string>()
  for (const root of SOURCE_ROOTS) {
    for (const file of walkTsFiles(root)) {
      const source = readFileSync(file, 'utf8')
      for (const namespace of extractClientTranslationNamespaces(source)) namespaces.add(namespace)
    }
  }
  return namespaces
}

function resolveSourceImport(fromFile: string, specifier: string): string | null {
  const basePath = specifier.startsWith('@/')
    ? join(SRC_ROOT, specifier.slice(2))
    : specifier.startsWith('./') || specifier.startsWith('../')
      ? resolve(dirname(fromFile), specifier)
      : null
  if (!basePath) return null

  for (const ext of SOURCE_EXTENSIONS) {
    const file = `${basePath}${ext}`
    if (existsSync(file)) return file
  }

  for (const ext of SOURCE_EXTENSIONS) {
    const file = join(basePath, `index${ext}`)
    if (existsSync(file)) return file
  }

  return null
}

function sourceImports(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const importPattern =
    /import\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
  const imports: string[] = []
  let match: RegExpExecArray | null
  while ((match = importPattern.exec(source))) {
    const resolved = resolveSourceImport(file, match[1] || match[2])
    if (resolved) imports.push(resolved)
  }
  return imports
}

function reachableSourceFilesFrom(root: string): string[] {
  const queue = walkTsFiles(root)
  const seen = new Set<string>()
  const files: string[] = []

  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || seen.has(file)) continue
    seen.add(file)
    files.push(file)
    for (const imported of sourceImports(file)) {
      if (!seen.has(imported)) queue.push(imported)
    }
  }

  return files
}

function usedPublicShellClientTranslationNamespaces(): Set<string> {
  return usedPublicShellClientTranslationNamespacesFor(PUBLIC_SHELL_ROOT)
}

function usedPublicShellClientTranslationNamespacesFor(root: string): Set<string> {
  const namespaces = new Set<string>()
  for (const file of reachableSourceFilesFrom(root)) {
    const source = readFileSync(file, 'utf8')
    for (const namespace of extractClientTranslationNamespaces(source)) namespaces.add(namespace)
  }
  return namespaces
}

function messagesFor(namespaces: readonly string[]): Record<string, { label: string }> {
  return Object.fromEntries(
    namespaces.map((namespace) => [namespace, { label: namespace }]),
  )
}

function sortedUnique(namespaces: readonly string[]): string[] {
  return [...new Set(namespaces)].sort()
}

describe('getClientMessages', () => {
  it('keeps every namespace referenced by client useTranslations calls', () => {
    const allowed = new Set<string>(CLIENT_MESSAGE_NAMESPACES)
    const missing = [...usedClientTranslationNamespaces()].filter((ns) => !allowed.has(ns))

    expect(missing).toEqual([])
  })

  it('keeps every namespace reachable from the public shell client components', () => {
    const allowed = new Set<string>(PUBLIC_CLIENT_MESSAGE_NAMESPACES)
    const missing = [...usedPublicShellClientTranslationNamespaces()].filter((ns) => !allowed.has(ns))

    expect(missing).toEqual([])
  })

  it('keeps every namespace reachable from each public provider scope', () => {
    for (const scope of PUBLIC_PROVIDER_SCOPES) {
      const allowed = new Set<string>(scope.namespaces)
      const missing = [...usedPublicShellClientTranslationNamespacesFor(scope.root)]
        .filter((ns) => !allowed.has(ns))

      expect(missing, scope.label).toEqual([])
    }
  })

  it('keeps public namespaces within the app provider namespace list', () => {
    const appNamespaces = new Set<string>(CLIENT_MESSAGE_NAMESPACES)
    const missing = PUBLIC_CLIENT_MESSAGE_NAMESPACES.filter((ns) => !appNamespaces.has(ns))

    expect(missing).toEqual([])
  })

  it('keeps the provider payload stable across App Router layout reuse', () => {
    const messages = messagesFor(CLIENT_MESSAGE_NAMESPACES)

    expect(Object.keys(getClientMessages(messages)).sort()).toEqual(
      [...CLIENT_MESSAGE_NAMESPACES].sort(),
    )
  })

  it('uses a tiny provider payload for locked app routes', () => {
    const messages = messagesFor(CLIENT_MESSAGE_NAMESPACES)

    expect(Object.keys(getAppShellClientMessages(messages, '/members', { locked: true })).sort())
      .toEqual(sortedUnique(APP_GATE_CLIENT_MESSAGE_NAMESPACES))
  })

  it('keeps full app provider payloads for unlocked app routes', () => {
    const messages = messagesFor(CLIENT_MESSAGE_NAMESPACES)
    const expected = sortedUnique(CLIENT_MESSAGE_NAMESPACES)

    expect(Object.keys(getAppShellClientMessages(messages, '/')).sort())
      .toEqual(expected)
    expect(Object.keys(getAppShellClientMessages(messages, '/members')).sort())
      .toEqual(expected)
    expect(Object.keys(getAppShellClientMessages(messages, '/shop')).sort())
      .toEqual(expected)
    expect(Object.keys(getAppShellClientMessages(messages, '/regear')).sort())
      .toEqual(expected)
  })

  it('keeps the public provider payload limited to public shell namespaces', () => {
    const messages = {
      ...messagesFor(PUBLIC_CLIENT_MESSAGE_NAMESPACES),
      adminGuide: { huge: 'server only' },
      adminActionError: { serverError: 'server only' },
    }

    expect(Object.keys(getPublicClientMessages(messages)).sort()).toEqual(
      sortedUnique(PUBLIC_CLIENT_MESSAGE_NAMESPACES),
    )
  })

  it('keeps split public provider payloads limited to their route scopes', () => {
    for (const scope of PUBLIC_PROVIDER_SCOPES) {
      const messages = {
        ...messagesFor(scope.namespaces),
        adminGuide: { huge: 'server only' },
        adminActionError: { serverError: 'server only' },
      }

      expect(Object.keys(scope.pick(messages)).sort(), scope.label).toEqual(
        sortedUnique(scope.namespaces),
      )
    }
  })

  it('filters server-only message namespaces out of the provider payload', () => {
    const messages = {
      common: { save: 'save' },
      nav: { home: 'home' },
      adminGuide: { huge: 'server only' },
      publicSeoFeatures: { headline: 'server only' },
    }

    expect(getClientMessages(messages)).toEqual({
      common: { save: 'save' },
      nav: { home: 'home' },
    })
  })
})
