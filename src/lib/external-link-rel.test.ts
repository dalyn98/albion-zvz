import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SCAN_DIRS = ['src/app', 'src/components']
const SOURCE_EXTENSIONS = new Set(['.tsx', '.ts'])
const TARGET_BLANK_TAG = /<(?:a|Link)\b[^>]*\btarget=["']_blank["'][^>]*>/g
const SAFE_REL = /\brel=["'][^"']*(?:noopener|noreferrer)[^"']*["']/

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...sourceFiles(fullPath))
    } else if (SOURCE_EXTENSIONS.has(path.extname(fullPath)) && !fullPath.endsWith('.test.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

describe('external new-tab links', () => {
  it('uses noopener or noreferrer for every target=_blank link', () => {
    const violations: string[] = []

    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(path.join(process.cwd(), dir))) {
        const source = readFileSync(file, 'utf8')
        for (const match of source.matchAll(TARGET_BLANK_TAG)) {
          const tag = match[0]
          if (SAFE_REL.test(tag)) continue

          const relativePath = path.relative(process.cwd(), file)
          violations.push(`${relativePath}:${lineNumberFor(source, match.index ?? 0)}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
