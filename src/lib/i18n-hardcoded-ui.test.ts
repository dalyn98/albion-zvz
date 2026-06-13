import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const KOREAN_TEXT_PATTERN = /[가-힣]/
const ALLOWED_KO_UI_PATH_SUFFIXES = new Set([
  // Imported only by /super-admin/marketing-screenshots/page.tsx.
  'src/components/SuperAdminMarketingScreenshotPanel.tsx',
])
const ALLOWED_KO_STRING_VALUES = new Set([
  '전투',
  '갱킹',
  '기타',
  '심판관',
  '데몬',
  '헬리온',
  '기사',
  '더스크위버',
  '가디언',
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
    normalized.includes('/src/app/(app-shell)/super-admin/') ||
    [...ALLOWED_KO_UI_PATH_SUFFIXES].some((suffix) => normalized.endsWith(suffix))
  )
}

function lineLabel(sourceFile: ts.SourceFile, position: number): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position)
  return `${sourceFile.fileName.replace(process.cwd(), '.')}:${line + 1}:${character + 1}`
}

describe('hardcoded Korean UI text', () => {
  it('keeps UI source files out of Korean-only literals outside documented exceptions', () => {
    const files = [
      ...listTsxFiles(join(process.cwd(), 'src/app')),
      ...listTsxFiles(join(process.cwd(), 'src/components')),
      join(process.cwd(), 'src/lib/seo-feature-pages.ts'),
    ].filter((file) => !isAllowedPath(file))

    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

      function visit(node: ts.Node): void {
        const report = (text: string, label: string): void => {
          if (!KOREAN_TEXT_PATTERN.test(text)) return
          if (ALLOWED_KO_STRING_VALUES.has(text)) return
          offenders.push(`${lineLabel(sourceFile, node.getStart(sourceFile))} ${label}: ${text}`)
        }

        if (ts.isJsxText(node)) {
          report(node.getText(sourceFile).trim(), 'JSX text')
        } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          report(node.text, ts.SyntaxKind[node.kind])
        } else if (ts.isTemplateExpression(node)) {
          report(
            [
              node.head.text,
              ...node.templateSpans.map((span) => span.literal.text),
            ].join('${}'),
            'TemplateExpression',
          )
        }
        ts.forEachChild(node, visit)
      }

      visit(sourceFile)
    }

    expect(offenders).toEqual([])
  })
})
