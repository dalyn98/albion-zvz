import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const sourceRoots = ['src/app', 'src/components']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(fullPath)
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

function parseSource(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      if (statement.expression.text === 'use client') return true
      continue
    }
    break
  }
  return false
}

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) {
    base = join(process.cwd(), 'src', specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    base = join(dirname(fromFile), specifier)
  } else {
    return null
  }

  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function collectClientFiles(files: string[]): Set<string> {
  return new Set(
    files.filter((filePath) => hasUseClientDirective(parseSource(filePath, readFileSync(filePath, 'utf8')))),
  )
}

function importedClientComponentNames(sourceFile: ts.SourceFile, clientFiles: Set<string>): Set<string> {
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue

    const resolved = resolveImport(sourceFile.fileName, statement.moduleSpecifier.text)
    if (!resolved || !clientFiles.has(resolved)) continue

    const clause = statement.importClause
    if (clause.name) names.add(clause.name.text)
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        names.add(element.name.text)
      }
    }
  }
  return names
}

function unwrapAwait(expression: ts.Expression): ts.Expression {
  return ts.isAwaitExpression(expression) ? expression.expression : expression
}

function promiseAllElements(expression: ts.Expression): readonly ts.Expression[] | null {
  const unwrapped = unwrapAwait(expression)
  if (!ts.isCallExpression(unwrapped)) return null
  if (unwrapped.expression.getText() !== 'Promise.all') return null
  const [firstArg] = unwrapped.arguments
  return firstArg && ts.isArrayLiteralExpression(firstArg) ? firstArg.elements : null
}

function collectTranslationFunctionVars(sourceFile: ts.SourceFile): Set<string> {
  const vars = new Set<string>()

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name) && /\bgetTranslations\s*\(/.test(node.initializer.getText(sourceFile))) {
        vars.add(node.name.text)
      }

      if (ts.isArrayBindingPattern(node.name)) {
        const elements = promiseAllElements(node.initializer)
        if (elements) {
          node.name.elements.forEach((binding, index) => {
            if (!ts.isBindingElement(binding) || !ts.isIdentifier(binding.name)) return
            if (/\bgetTranslations\s*\(/.test(elements[index]?.getText(sourceFile) ?? '')) {
              vars.add(binding.name.text)
            }
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return vars
}

function jsxTagName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  return node.tagName.getText()
}

describe('RSC to Client translation props', () => {
  it('does not pass getTranslations() functions into Client components', () => {
    const files = sourceRoots.flatMap((root) => sourceFiles(join(process.cwd(), root)))
    const clientFiles = collectClientFiles(files)
    const offenders: string[] = []

    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8')
      const sourceFile = parseSource(filePath, source)
      if (hasUseClientDirective(sourceFile) || !source.includes('getTranslations')) continue

      const clientNames = importedClientComponentNames(sourceFile, clientFiles)
      if (clientNames.size === 0) continue

      const translationVars = collectTranslationFunctionVars(sourceFile)
      if (translationVars.size === 0) continue

      function visit(node: ts.Node): void {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = jsxTagName(node)
          if (clientNames.has(tagName)) {
            for (const prop of node.attributes.properties) {
              if (!ts.isJsxAttribute(prop) || !prop.initializer) continue
              if (!ts.isJsxExpression(prop.initializer)) continue
              const expression = prop.initializer.expression
              if (!expression || !ts.isIdentifier(expression)) continue
              if (!translationVars.has(expression.text)) continue

              const location = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile))
              offenders.push(
                `${filePath.replace(`${process.cwd()}/`, '')}:${location.line + 1} passes ${expression.text} to <${tagName}>.${prop.name.getText(sourceFile)}`,
              )
            }
          }
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
    }

    expect(offenders).toEqual([])
  })
})
