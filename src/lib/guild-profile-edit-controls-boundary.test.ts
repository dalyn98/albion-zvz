import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('guild profile edit controls boundary', () => {
  it('provides toast context inside the public guild profile edit controls client boundary', () => {
    const source = read('src/components/guild/GuildProfileEditControlsClient.tsx')

    expect(source).toContain("import { ToastProvider } from '@/components/ToastProvider'")
    expect(source).toContain('<ToastProvider>')
    expect(source).toContain('</ToastProvider>')
  })

  it('provides toast context for the public admin team grid', () => {
    const source = read('src/components/AdminTeamGridClient.tsx')

    expect(source).toContain('ToastProvider')
    expect(source).toContain("from './ToastProvider'")
    expect(source).toContain('<ToastProvider>')
    expect(source).toContain('</ToastProvider>')
  })
})
