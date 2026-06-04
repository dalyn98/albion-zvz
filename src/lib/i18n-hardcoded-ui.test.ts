import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const KOREAN_TEXT_PATTERN = /[가-힣]/
const ALLOWED_KO_UI_PATH_SUFFIXES = new Set([
  // Imported only by /super-admin/marketing-screenshots/page.tsx.
  'src/components/SuperAdminMarketingScreenshotPanel.tsx',
])

function listTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listTsxFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

function isAllowedPath(file: string): boolean {
  const normalized = file.split('\\').join('/')
  return (
    normalized.includes('/src/app/super-admin/') ||
    [...ALLOWED_KO_UI_PATH_SUFFIXES].some((suffix) => normalized.endsWith(suffix))
  )
}

function lineLabel(sourceFile: ts.SourceFile, position: number): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position)
  return `${sourceFile.fileName.replace(process.cwd(), '.')}:${line + 1}:${character + 1}`
}

describe('hardcoded Korean UI text', () => {
  it('keeps JSX text and JSX string attributes out of Korean-only literals outside super-admin', () => {
    const files = [
      ...listTsxFiles(join(process.cwd(), 'src/app')),
      ...listTsxFiles(join(process.cwd(), 'src/components')),
    ].filter((file) => !isAllowedPath(file))

    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

      function visit(node: ts.Node): void {
        if (ts.isJsxText(node)) {
          const text = node.getText(sourceFile).trim()
          if (KOREAN_TEXT_PATTERN.test(text)) {
            offenders.push(`${lineLabel(sourceFile, node.getStart(sourceFile))} JSX text: ${text}`)
          }
        }
        if (
          ts.isJsxAttribute(node) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer) &&
          KOREAN_TEXT_PATTERN.test(node.initializer.text)
        ) {
          offenders.push(
            `${lineLabel(sourceFile, node.initializer.getStart(sourceFile))} ${node.name.getText(sourceFile)}="${node.initializer.text}"`,
          )
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
    }

    expect(offenders).toEqual([])
  })
})
