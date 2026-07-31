import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CI workflow', () => {
  it('runs TypeScript and production builds with enough heap before changes can merge', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/test.yml'), 'utf8')

    expect(workflow).toMatch(
      /      - name: TypeScript check\n        env:\n          NODE_OPTIONS: --max-old-space-size=4096\n        run: npm run typecheck/,
    )
    expect(workflow).toMatch(
      /      - name: Production build\n(?:        .+\n)*        run: npm run build/,
    )
    expect(workflow).toContain('      - name: Lint\n        run: npm run lint')
    expect(workflow).toContain('      - name: Unit tests\n        run: npm test')
  })
})
