import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCAN_DIRS = ['src/app', 'src/components']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const RAW_HTML_PATTERNS = [
  /\bdangerouslySetInnerHTML\b/,
  /\binnerHTML\s*=/,
  /\bouterHTML\s*=/,
  /\binsertAdjacentHTML\s*\(/,
]
const REVIEW_WINDOW_CHARS = 320

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...sourceFiles(fullPath))
    } else if (SOURCE_EXTENSIONS.has(extname(fullPath)) && !fullPath.endsWith('.test.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function isReviewedRawHtmlException(source: string, index: number): boolean {
  const start = Math.max(0, index - REVIEW_WINDOW_CHARS)
  const end = Math.min(source.length, index + REVIEW_WINDOW_CHARS)
  const context = source.slice(start, end)
  return context.includes('type="application/ld+json"') && context.includes('serializeJsonLd(')
}

describe('raw HTML rendering', () => {
  it('does not render raw HTML without an explicit reviewed exception', () => {
    const violations: string[] = []

    for (const dir of SCAN_DIRS) {
      for (const filePath of sourceFiles(join(process.cwd(), dir))) {
        const source = readFileSync(filePath, 'utf8')
        for (const pattern of RAW_HTML_PATTERNS) {
          const match = pattern.exec(source)
          if (!match) continue
          if (isReviewedRawHtmlException(source, match.index)) continue
          violations.push(`${relative(process.cwd(), filePath)}:${lineNumberFor(source, match.index)}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
