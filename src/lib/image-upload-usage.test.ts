import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const actionsDir = join(process.cwd(), 'src', 'app', 'actions')

function actionSourceFiles(dir = actionsDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return actionSourceFiles(fullPath)
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

describe('server action image uploads', () => {
  it('validates file content before storage uploads', () => {
    const offenders = actionSourceFiles()
      .filter((filePath) => {
        const source = readFileSync(filePath, 'utf8')
        return /\.upload\s*\(/.test(source) && !/\bvalidateImageUploadFile\s*\(/.test(source)
      })
      .map((filePath) => filePath.replace(`${process.cwd()}/`, ''))

    expect(offenders).toEqual([])
  })
})
