import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('demo marketing capture frame', () => {
  it('activates only for the explicit marketing query flag', () => {
    const frame = source(
      'src/app/(public-shell)/demo/_components/DemoCaptureFrame.tsx',
    )

    expect(frame).toContain("searchParams.get('marketing') === '1'")
    expect(frame).toContain('demo-marketing-capture')
    expect(frame).toContain('data-marketing-capture')
  })

  it('marks demo chrome as hidden while widening the product content', () => {
    const layout = source('src/app/(public-shell)/demo/layout.tsx')
    const css = source('src/app/globals.css')

    expect(layout).toContain('data-demo-capture-hide="true"')
    expect(layout).toContain('data-demo-capture-main="true"')
    expect(layout).toContain('data-demo-capture-content="true"')
    expect(css).toContain(".demo-marketing-capture [data-demo-capture-hide='true']")
    expect(css).toContain('max-width: 95rem')
  })
})
