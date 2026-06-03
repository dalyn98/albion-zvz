import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const migrationFileNamePattern = /^(\d{3})_[a-z0-9_]+\.sql$/

describe('supabase migrations', () => {
  it('uses contiguous three-digit prefixes without duplicate migration numbers', () => {
    const files = readdirSync(migrationsDir)
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort()

    const invalidFileNames = files.filter(
      (fileName) => !migrationFileNamePattern.test(fileName),
    )
    expect(invalidFileNames).toEqual([])

    const prefixes = files.map((fileName) => {
      const match = migrationFileNamePattern.exec(fileName)
      if (!match) throw new Error(`Invalid migration file name: ${fileName}`)
      return match[1]
    })

    const duplicatePrefixes = prefixes.filter(
      (prefix, index) => prefixes.indexOf(prefix) !== index,
    )
    expect(duplicatePrefixes).toEqual([])

    const migrationNumbers = prefixes.map((prefix) => Number.parseInt(prefix, 10))
    const maxMigrationNumber = Math.max(...migrationNumbers)
    const presentNumbers = new Set(migrationNumbers)
    const missingPrefixes = Array.from({ length: maxMigrationNumber + 1 }, (_, index) =>
      index.toString().padStart(3, '0'),
    ).filter((prefix) => !presentNumbers.has(Number.parseInt(prefix, 10)))

    expect(missingPrefixes).toEqual([])
  })
})
