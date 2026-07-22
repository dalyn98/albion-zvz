import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('profile and backup workflows', () => {
  it('previews profile edits live and saves the related settings as one batch', () => {
    const editor = source('src/components/GuildProfileEditor.tsx')
    const actions = source('src/app/actions/settings.ts')

    expect(editor).toContain('livePreview')
    expect(editor).toContain('saveAllProfileSettings')
    expect(editor).toContain('updateGuildProfileSettings')
    expect(actions).toContain('export async function updateGuildProfileSettings')
    expect(actions).toContain("onConflict: 'guild_id,key'")
  })

  it('downloads a pre-import safety backup and keeps a detailed restore receipt', () => {
    const panel = source('src/components/GuildBackupPanel.tsx')

    expect(panel).toContain('preImportBackup')
    expect(panel).toContain('importReceipt')
    expect(panel).toContain("t('safetyBackupDownloaded')")
    expect(panel).toContain('unchanged')
  })
})
