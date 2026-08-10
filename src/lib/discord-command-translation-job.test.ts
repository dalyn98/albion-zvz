import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts/discord-command-translation-job.mjs')

describe('Discord command translation job', () => {
  it('extracts unique public command copy and protects command placeholders', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'agm-discord-translation-test-'))
    const prepared = spawnSync(process.execPath, [script, 'prepare', 'de'], {
      encoding: 'utf8',
      env: { ...process.env, AGM_TRANSLATION_TMP_DIR: tempDirectory },
    })
    expect(prepared.status, prepared.stderr).toBe(0)

    const job = JSON.parse(
      readFileSync(join(tempDirectory, 'agm-discord-command-translation-de-job.json'), 'utf8'),
    ) as {
      jobDigest: string
      items: Array<{ source: string; text: string; tokenValues: string[] }>
    }
    expect(job.jobDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(job.items.length).toBeGreaterThan(80)
    const panelCopy = job.items.find(
      (item) => item.source === 'Optional panel text; {name} is the guild',
    )
    expect(panelCopy?.tokenValues).toContain('{name}')
    expect(panelCopy?.text).not.toContain('{name}')

    const reviewed = JSON.parse(
      readFileSync(
        join(process.cwd(), 'src/lib/discord-command-reviewed-overrides/de.json'),
        'utf8',
      ),
    ) as Record<string, string>
    expect(Object.keys(reviewed).sort()).toEqual(
      job.items.map((item) => item.source).sort(),
    )
    expect(Object.values(reviewed).every((value) => value.length >= 1 && value.length <= 100)).toBe(true)
    rmSync(tempDirectory, { recursive: true, force: true })
  })

  it('rejects Discord-unsupported site locales for command registration', () => {
    for (const locale of ['ar', 'pt-PT']) {
      const rejected = spawnSync(process.execPath, [script, 'prepare', locale], {
        encoding: 'utf8',
      })
      expect(rejected.status, locale).toBe(2)
    }
  })

  it('keeps Traditional Chinese in the hand-authored Discord catalog', () => {
    const rejected = spawnSync(
      'bash',
      [join(process.cwd(), 'scripts/run-apple-message-translation.sh'), 'zh-Hant', 'discord'],
      { encoding: 'utf8' },
    )
    expect(rejected.status).toBe(2)
    expect(rejected.stderr).toContain('built-in Traditional Chinese catalog')
  })

  it('uses the shared Albion terminology when restoring protected Discord copy', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'agm-discord-translation-test-'))
    const overridesDirectory = join(tempDirectory, 'overrides')
    const catalogPath = join(tempDirectory, 'catalog.json')
    mkdirSync(overridesDirectory)
    writeFileSync(catalogPath, '{}\n')
    const env = {
      ...process.env,
      AGM_TRANSLATION_TMP_DIR: tempDirectory,
      AGM_DISCORD_TRANSLATION_CATALOG: catalogPath,
      AGM_DISCORD_REVIEWED_OVERRIDES_DIR: overridesDirectory,
    }
    const prepared = spawnSync(process.execPath, [script, 'prepare', 'fr'], { encoding: 'utf8', env })
    expect(prepared.status, prepared.stderr).toBe(0)
    const job = JSON.parse(
      readFileSync(join(tempDirectory, 'agm-discord-command-translation-fr-job.json'), 'utf8'),
    ) as {
      jobDigest: string
      items: Array<{ id: string; source: string; text: string }>
    }
    writeFileSync(
      join(tempDirectory, 'agm-discord-command-translation-fr-result.json'),
      `${JSON.stringify({
        locale: 'fr',
        jobDigest: job.jobDigest,
        items: job.items.map((item) => ({ id: item.id, text: item.text })),
      })}\n`,
    )
    const applied = spawnSync(process.execPath, [script, 'apply', 'fr'], { encoding: 'utf8', env })
    expect(applied.status, applied.stderr).toBe(0)
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
      fr: Record<string, string>
    }
    expect(catalog.fr['Confirm my crafted regear pickup']).toContain('regear crafté')
    rmSync(tempDirectory, { recursive: true, force: true })
  })
})
