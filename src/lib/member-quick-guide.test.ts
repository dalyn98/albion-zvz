import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const guideHtml = readFileSync(
  join(process.cwd(), 'public/member-quick-guide.html'),
  'utf8',
)

describe('member quick guide Discord commands', () => {
  it('documents the member-facing grouped /agm commands', () => {
    expect(guideHtml).toContain('/agm help')
    expect(guideHtml).toContain('/agm me verify')
    expect(guideHtml).toContain('/agm wallet balance')
    expect(guideHtml).toContain('/agm wallet withdraw amount:1000')
    expect(guideHtml).toContain('/agm open page:events')
    expect(guideHtml).toContain('/agm open page:shop')
  })

  it('does not teach retired flat member commands', () => {
    expect(guideHtml).not.toContain('/agm verify</code>')
    expect(guideHtml).not.toContain('/agm events</code>')
    expect(guideHtml).not.toContain('/agm me</code>')
    expect(guideHtml).not.toContain('/agm shop</code>')
  })
})
