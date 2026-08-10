import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts/docs-translation-job.mjs')

describe('docs translation job', () => {
  it('extracts Korean Markdown and JSX card copy without modifying MDX structure', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'agm-docs-translation-test-'))
    const prepared = spawnSync(process.execPath, [script, 'prepare', 'en'], {
      encoding: 'utf8',
      env: { ...process.env, AGM_TRANSLATION_TMP_DIR: tempDirectory },
    })
    expect(prepared.status, prepared.stderr).toBe(0)

    const job = JSON.parse(
      readFileSync(join(tempDirectory, 'agm-docs-translation-en-job.json'), 'utf8'),
    ) as {
      jobDigest: string
      items: Array<{
        source: string
        text: string
        kind: 'markdown' | 'jsx-string'
        tokenValues: string[]
      }>
    }
    expect(job.jobDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(job.items.length).toBeGreaterThan(1_000)
    expect(new Set(job.items.map((item) => item.source)).size).toBe(job.items.length)
    expect(job.items.some((item) => item.kind === 'jsx-string')).toBe(true)

    const zvzCopy = job.items.find((item) => item.source.includes('대형 ZvZ'))
    expect(zvzCopy?.tokenValues).toContain('ZvZ')
    expect(zvzCopy?.text).not.toContain('ZvZ')

    const partySlotCopy = job.items.find((item) => item.source.includes('이벤트 파티·슬롯'))
    expect(partySlotCopy?.tokenValues).toEqual(expect.arrayContaining(['파티', '슬롯']))
    expect(partySlotCopy?.text).not.toContain('파티')
    expect(partySlotCopy?.text).not.toContain('슬롯')

    rmSync(tempDirectory, { recursive: true, force: true })
  })

  it('rejects the Korean source locale as a target', () => {
    const rejected = spawnSync(process.execPath, [script, 'prepare', 'ko'], {
      encoding: 'utf8',
    })
    expect(rejected.status).toBe(2)
  })

  it('applies reviewed overrides and rejects stale source entries', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'agm-docs-translation-test-'))
    const overridesDirectory = join(tempDirectory, 'overrides')
    const catalogPath = join(tempDirectory, 'catalog.json')
    mkdirSync(overridesDirectory)
    writeFileSync(catalogPath, '{"sourceLocale":"ko","sourceDigest":"","sourceStrings":0,"locales":{}}\n')
    const env = {
      ...process.env,
      AGM_TRANSLATION_TMP_DIR: tempDirectory,
      AGM_DOCS_REVIEWED_OVERRIDES_DIR: overridesDirectory,
      AGM_DOCS_TRANSLATION_CATALOG: catalogPath,
    }
    const englishPrepared = spawnSync(process.execPath, [script, 'prepare', 'en'], { encoding: 'utf8', env })
    expect(englishPrepared.status, englishPrepared.stderr).toBe(0)
    const englishJobPath = join(tempDirectory, 'agm-docs-translation-en-job.json')
    const englishResultPath = join(tempDirectory, 'agm-docs-translation-en-result.json')
    const englishJob = JSON.parse(readFileSync(englishJobPath, 'utf8')) as {
      jobDigest: string
      items: Array<{ id: string; text: string }>
    }
    writeFileSync(
      englishResultPath,
      `${JSON.stringify({
        locale: 'en',
        jobDigest: englishJob.jobDigest,
        items: englishJob.items.map((item) => ({
          id: item.id,
          text: item.text.replace(/[가-힣]+/g, 'English'),
        })),
      })}\n`,
    )
    const englishApplied = spawnSync(process.execPath, [script, 'apply', 'en'], { encoding: 'utf8', env })
    expect(englishApplied.status, englishApplied.stderr).toBe(0)

    const prepared = spawnSync(process.execPath, [script, 'prepare', 'de'], { encoding: 'utf8', env })
    expect(prepared.status, prepared.stderr).toBe(0)
    const jobPath = join(tempDirectory, 'agm-docs-translation-de-job.json')
    const resultPath = join(tempDirectory, 'agm-docs-translation-de-result.json')
    const job = JSON.parse(readFileSync(jobPath, 'utf8')) as {
      jobDigest: string
      items: Array<{ id: string; source: string; text: string }>
    }
    const reviewed = job.items[0]
    writeFileSync(
      resultPath,
      `${JSON.stringify({
        locale: 'de',
        jobDigest: job.jobDigest,
        items: job.items.map((item) => ({ id: item.id, text: item.text })),
      })}\n`,
    )
    writeFileSync(
      join(overridesDirectory, 'de.json'),
      `${JSON.stringify({ [reviewed.source]: 'Von Menschen geprüfte Übersetzung' })}\n`,
    )

    const applied = spawnSync(process.execPath, [script, 'apply', 'de'], { encoding: 'utf8', env })
    expect(applied.status, applied.stderr).toBe(0)
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
      locales: { de: Record<string, string> }
    }
    expect(catalog.locales.de[reviewed.source]).toBe('Von Menschen geprüfte Übersetzung')

    writeFileSync(join(overridesDirectory, 'de.json'), '{"stale source":"translation"}\n')
    const rejected = spawnSync(process.execPath, [script, 'apply', 'de'], { encoding: 'utf8', env })
    expect(rejected.status).not.toBe(0)
    expect(rejected.stderr).toContain('stale docs reviewed override source')

    rmSync(tempDirectory, { recursive: true, force: true })
  })
})
