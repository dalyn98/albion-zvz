import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function normalizeType(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+default\s+[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function signatureTypes(args: string): string {
  const cleaned = args.replace(/--.*$/gm, '').trim()
  if (!cleaned) return ''
  return cleaned
    .split(',')
    .map((arg) => {
      const withoutDefault = arg.replace(/\s+default\s+[\s\S]*$/i, '').trim()
      const parts = withoutDefault.split(/\s+/).filter(Boolean)
      const first = parts[0]?.toLowerCase()
      if (
        parts.length >= 2 &&
        first &&
        !['uuid', 'text', 'jsonb', 'integer', 'bigint', 'boolean'].includes(first) &&
        !first.endsWith('[]')
      ) {
        parts.shift()
      }
      return normalizeType(parts.join(' '))
    })
    .join(', ')
}

interface FunctionDefinition {
  signature: string
  source: string
}

function currentFunctionDefinitions(): Map<string, FunctionDefinition> {
  const definitions = new Map<string, FunctionDefinition>()
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    for (const match of sql.matchAll(/drop\s+function\s+if\s+exists\s+public\.([a-zA-Z_][\w]*)\s*\(([^)]*)\)/gi)) {
      definitions.delete(`public.${match[1].toLowerCase()}(${signatureTypes(match[2])})`)
    }

    const functionPattern =
      /create\s+or\s+replace\s+function\s+((?:public\.)?[a-zA-Z_][\w]*)\s*\(([^)]*)\)([\s\S]*?)(?=\n\s*(?:create\s+or\s+replace\s+function|drop\s+function|alter\s+function|grant\s+|create\s+trigger|create\s+policy|$))/gi
    for (const match of sql.matchAll(functionPattern)) {
      const rawName = match[1].toLowerCase()
      const qualifiedName = rawName.startsWith('public.') ? rawName : `public.${rawName}`
      const signature = `${qualifiedName}(${signatureTypes(match[2])})`
      definitions.set(signature, { signature, source: match[0] })
    }
  }

  return definitions
}

describe('RPC search_path hardening', () => {
  it('pins search_path for every current public security-definer function', () => {
    expect(statSync(migrationsDir).isDirectory()).toBe(true)

    const allMigrationsSql = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
      .join('\n')

    const missing = [...currentFunctionDefinitions().values()]
      .filter((definition) => /security\s+definer/i.test(definition.source))
      .filter((definition) => {
        if (/set\s+search_path\s*=\s*public/i.test(definition.source)) return false
        const escapedSignature = definition.signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const alterPattern = new RegExp(
          `'${escapedSignature}'[\\s\\S]*?alter function %s set search_path = public`,
          'i',
        )
        const directAlterPattern = new RegExp(
          `alter\\s+function\\s+${escapedSignature}\\s+set\\s+search_path\\s*=\\s*public`,
          'i',
        )
        return !alterPattern.test(allMigrationsSql) && !directAlterPattern.test(allMigrationsSql)
      })
      .map((definition) => definition.signature)

    expect(missing).toEqual([])
  })
})
