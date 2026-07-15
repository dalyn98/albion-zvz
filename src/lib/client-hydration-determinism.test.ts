import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function listTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listTsxFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

function isClientComponent(source: string): boolean {
  return /^['"]use client['"]/.test(source.trimStart())
}

describe('client hydration determinism', () => {
  it('does not use runtime-default Intl date formatting in client components', () => {
    const files = [
      ...listTsxFiles(join(process.cwd(), 'src/app')),
      ...listTsxFiles(join(process.cwd(), 'src/components')),
    ]
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return isClientComponent(source) && /new\s+Intl\.DateTimeFormat\(\s*undefined\b/.test(source)
    })

    expect(offenders.map((file) => file.replace(process.cwd(), '.'))).toEqual([])
  })

  it('does not use runtime-default string collation in client components', () => {
    const files = [
      ...listTsxFiles(join(process.cwd(), 'src/app')),
      ...listTsxFiles(join(process.cwd(), 'src/components')),
    ]
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return isClientComponent(source) && /\.localeCompare\s*\(/.test(source)
    })

    expect(offenders.map((file) => file.replace(process.cwd(), '.'))).toEqual([])
  })
})
