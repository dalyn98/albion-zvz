import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CI workflow', () => {
  it('builds the production app before changes can merge', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/test.yml'), 'utf8')

    expect(workflow).toMatch(/- name: Production build\s+run: npm run build/)
  })
})
