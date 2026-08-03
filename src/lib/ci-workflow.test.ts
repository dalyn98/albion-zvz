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
    expect(workflow).toContain(
      '      - name: Unit tests and coverage floor\n        run: npm run test:coverage',
    )
    expect(workflow).toContain('      - name: Strict integration tests')
    expect(workflow).toContain('run: npm run test:integration:required')
    expect(workflow).toContain('Vercel Deployment Checks block')
    expect(workflow).toMatch(/^  unit:$/m)
    expect(workflow).toMatch(/^  integration:$/m)
    expect(workflow).toMatch(/^  migration-drift:$/m)
    expect(workflow).not.toContain('contents: write')
    expect(workflow).not.toContain('git push origin')
    expect(workflow).toContain('actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f')
  })
})
