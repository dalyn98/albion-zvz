import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOTS = ['src/app', 'src/components', 'src/lib']
const FORBIDDEN_CLIENT_IMPORTS = new Set(['next/headers', 'server-only'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(fullPath)
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [fullPath] : []
  })
}

function parseSource(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
}

function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  return hasDirective(sourceFile, 'use client')
}

function hasUseServerDirective(sourceFile: ts.SourceFile): boolean {
  return hasDirective(sourceFile, 'use server')
}

function hasDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      if (statement.expression.text === directive) return true
      continue
    }
    break
  }
  return false
}

function resolveInternalImport(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/') ?
    join(process.cwd(), 'src', specifier.slice(2)) :
    specifier.startsWith('.') ?
      join(dirname(fromFile), specifier) :
      null
  if (!base) return null
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

function isTypeOnlyImport(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause
  if (!clause) return false
  if (clause.isTypeOnly) return true
  if (clause.name) return false
  const bindings = clause.namedBindings
  return Boolean(
    bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every((element) => element.isTypeOnly),
  )
}

function importedRuntimeSpecifiers(sourceFile: ts.SourceFile): Array<{
  specifier: string
  statement: ts.ImportDeclaration | ts.ExportDeclaration
}> {
  const imports: Array<{
    specifier: string
    statement: ts.ImportDeclaration | ts.ExportDeclaration
  }> = []
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (isTypeOnlyImport(statement)) continue
      if (ts.isStringLiteral(statement.moduleSpecifier)) {
        imports.push({ specifier: statement.moduleSpecifier.text, statement })
      }
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue
      if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        imports.push({ specifier: statement.moduleSpecifier.text, statement })
      }
    }
  }
  return imports
}

function serverOnlyImportChain(
  filePath: string,
  seen: Set<string> = new Set(),
): string[] | null {
  if (seen.has(filePath)) return null
  seen.add(filePath)

  const source = readFileSync(filePath, 'utf8')
  const sourceFile = parseSource(filePath)
  if (hasUseServerDirective(sourceFile)) return null

  if (source.includes("import 'server-only'") || source.includes('import "server-only"')) {
    return [filePath]
  }

  for (const { specifier } of importedRuntimeSpecifiers(sourceFile)) {
    if (FORBIDDEN_CLIENT_IMPORTS.has(specifier)) return [filePath, specifier]
    const resolved = resolveInternalImport(filePath, specifier)
    if (!resolved) continue
    const chain = serverOnlyImportChain(resolved, seen)
    if (chain) return [filePath, ...chain]
  }

  return null
}

describe('client/server module boundary', () => {
  it('keeps server-only modules out of Client Component import graphs', () => {
    const offenders: string[] = []
    const files = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root)))

    for (const filePath of files) {
      const sourceFile = parseSource(filePath)
      if (!hasUseClientDirective(sourceFile)) continue

      for (const { specifier, statement } of importedRuntimeSpecifiers(sourceFile)) {
        const chain = FORBIDDEN_CLIENT_IMPORTS.has(specifier)
          ? [filePath, specifier]
          : (() => {
              const resolved = resolveInternalImport(filePath, specifier)
              return resolved ? serverOnlyImportChain(resolved) : null
            })()
        if (chain) {
          const location = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile))
          offenders.push(
            `${filePath.replace(`${process.cwd()}/`, '')}:${location.line + 1} imports ${specifier} -> ${chain
              .map((item) => item.replace(`${process.cwd()}/`, ''))
              .join(' -> ')}`,
          )
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
