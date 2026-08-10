import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts/message-translation-job.mjs')

function applyProtectedSample(
  locale:
    | 'zh-Hant'
    | 'fr'
    | 'es-ES'
    | 'es-419'
    | 'pt-BR'
    | 'pt-PT'
    | 'pl'
    | 'ru'
    | 'it'
    | 'id'
    | 'ar'
    | 'tr',
  sample: string,
  mutateTranslation: (text: string) => string = (text) => text,
  reviewedOverride?: string,
): string {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'agm-message-translation-test-'))
  const messagesDirectory = join(tempDirectory, 'messages')
  const translationDirectory = join(tempDirectory, 'translation')
  mkdirSync(messagesDirectory)
  mkdirSync(translationDirectory)
  if (reviewedOverride !== undefined) {
    mkdirSync(join(messagesDirectory, 'reviewed-overrides'))
    writeFileSync(
      join(messagesDirectory, 'reviewed-overrides', `${locale}.json`),
      `${JSON.stringify({ sample: reviewedOverride })}\n`,
    )
  }
  const source = { sample }
  writeFileSync(join(messagesDirectory, 'en.json'), `${JSON.stringify(source)}\n`)
  writeFileSync(join(messagesDirectory, `${locale}.json`), `${JSON.stringify(source)}\n`)
  const env = {
    ...process.env,
    AGM_MESSAGES_DIR: messagesDirectory,
    AGM_TRANSLATION_TMP_DIR: translationDirectory,
  }
  const prepared = spawnSync(process.execPath, [script, 'prepare', locale], { encoding: 'utf8', env })
  expect(prepared.status, prepared.stderr).toBe(0)
  const job = JSON.parse(
    readFileSync(join(translationDirectory, `agm-message-translation-${locale}-job.json`), 'utf8'),
  ) as {
    jobDigest: string
    items: Array<{ id: string; text: string }>
  }
  writeFileSync(
    join(translationDirectory, `agm-message-translation-${locale}-result.json`),
    `${JSON.stringify({
      locale,
      jobDigest: job.jobDigest,
      items: job.items.map((item) => ({ id: item.id, text: mutateTranslation(item.text) })),
    })}\n`,
  )
  const applied = spawnSync(process.execPath, [script, 'apply', locale], { encoding: 'utf8', env })
  expect(applied.status, applied.stderr).toBe(0)
  const translated = JSON.parse(
    readFileSync(join(messagesDirectory, `${locale}.json`), 'utf8'),
  ) as { sample: string }
  rmSync(tempDirectory, { recursive: true, force: true })
  return translated.sample
}

describe('message translation job', () => {
  it('protects placeholders and Albion community terminology before translation', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'agm-message-translation-test-'))
    const prepared = spawnSync(process.execPath, [script, 'prepare', 'de'], {
      encoding: 'utf8',
      env: { ...process.env, AGM_TRANSLATION_TMP_DIR: tempDirectory },
    })
    expect(prepared.status, prepared.stderr).toBe(0)

    const job = JSON.parse(
      readFileSync(join(tempDirectory, 'agm-message-translation-de-job.json'), 'utf8'),
    ) as {
      jobDigest: string
      items: Array<{ key: string; text: string; tokenValues: string[] }>
    }
    expect(job.jobDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(job.items.length).toBeGreaterThan(9_000)

    const description = job.items.find((item) => item.key === 'meta.description')
    expect(description?.tokenValues).toEqual(
      expect.arrayContaining(['AlbionGuildManager', 'Albion Online', 'ZvZ', 'regear']),
    )
    expect(description?.text).not.toContain('Albion Online')

    const suggestion = job.items.find(
      (item) => item.key === 'sidebar.languageSuggestion',
    )
    expect(suggestion?.tokenValues).toContain('{label}')
    expect(suggestion?.text).not.toContain('{label}')

    const categoryHint = job.items.find(
      (item) => item.key === 'adminEventForm.categoryHint',
    )
    expect(categoryHint?.tokenValues).toEqual(
      expect.arrayContaining(['ZvZ', 'fame farming', 'Ganking', 'PvP']),
    )
    expect(categoryHint?.text).not.toContain('Fame farming')

    const manualRegear = job.items.find(
      (item) => item.key === 'adminParty.manualRegearExcludeLabel',
    )
    expect(manualRegear?.tokenValues).toContain('manual regear')

    const battleMount = job.items.find(
      (item) => item.key === 'adminRegearRolePolicies.group_battle_mount',
    )
    expect(battleMount).toBeUndefined()
    rmSync(tempDirectory, { recursive: true, force: true })
  })

  it('rejects locales outside the declared translation contract', () => {
    const rejected = spawnSync(process.execPath, [script, 'prepare', 'vi'], {
      encoding: 'utf8',
    })
    expect(rejected.status).toBe(2)
  })

  it('restores protected terms with French Albion community vocabulary', () => {
    const translated = applyProtectedSample(
      'fr',
      'Manual regear in the Black Zone uses a Build Sheet, Gear, and a Caller.',
    )
    expect(translated).toContain('regear manuel')
    expect(translated).toContain('zone noire')
    expect(translated).toContain('fiche de composition')
    expect(translated).toContain('stuff')
    expect(translated).toContain('shotcaller')
  })

  it('normalizes only recognizable Apple Translation token mutations', () => {
    const translated = applyProtectedSample(
      'fr',
      'Approve {n}{amount}{total}{extra}{status}{event} for Albion.',
      (text) => text
        .replace('__AGM_TOKEN_0000__', '_AGM_TOKEN_0000__')
        .replace('__AGM_TOKEN_0001__', '__AGM_TOKEN_KEN_0001__')
        .replace('__AGM_TOKEN_0002__', '__AGM_TOKEN_002__')
        .replace('__AGM_TOKEN_0003__', '__AGM_代幣_0003__')
        .replace('__AGM_TOKEN_0004__', '__TOKEN_AGM_0004__')
        .replace('__AGM_TOKEN_0005__', '__RUPS_TOKEN_0005__')
        .replace('__AGM_TOKEN_0006__', '__AGM_TOKEN pembayaran_0006__'),
    )
    expect(translated).toBe('Approve {n}{amount}{total}{extra}{status}{event} for Albion.')
  })

  it('uses a reviewed override when machine translation duplicates protected tokens', () => {
    const translated = applyProtectedSample(
      'zh-Hant',
      'Step {current} of {total}',
      (text) => text.replace('__AGM_TOKEN_0001__', '__AGM_TOKEN_0000__'),
      '第 {current} 步，共 {total} 步',
    )
    expect(translated).toBe('第 {current} 步，共 {total} 步')
  })

  it('restores protected terms with Traditional Chinese Albion community vocabulary', () => {
    const translated = applyProtectedSample(
      'zh-Hant',
      'Auto regear in the Black Zone uses a Build Sheet, Gear, a Caller, and Kill Fame.',
    )
    expect(translated).toContain('自動補裝')
    expect(translated).toContain('黑區')
    expect(translated).toContain('配裝表')
    expect(translated).toContain('裝備')
    expect(translated).toContain('指揮')
    expect(translated).toContain('擊殺聲望')
  })

  it('localizes a standalone protected Albion term without a machine translation job', () => {
    expect(applyProtectedSample('zh-Hant', 'Regear')).toBe('補裝')
    expect(applyProtectedSample('zh-Hant', 'Guest regear')).toBe('訪客補裝')
  })

  it.each(['es-ES', 'es-419'] as const)(
    'restores protected terms with %s Albion community vocabulary',
    (locale) => {
      const translated = applyProtectedSample(
        locale,
        'Auto regear in the Black Zone uses a Build Sheet for Fame Farming and Small Scale Ganking.',
      )
      expect(translated).toContain('regear automático')
      expect(translated).toContain('zona negra')
      expect(translated).toContain('hoja de builds')
      expect(translated).toContain('farmeo de fama')
      expect(translated).toContain('pequeña escala')
      expect(translated).toContain('gankeo')
    },
  )

  it.each([
    ['pt-BR', 'planilha de builds', 'registrada'],
    ['pt-PT', 'folha de builds', 'registada'],
  ] as const)(
    'restores protected terms with %s Albion community vocabulary',
    (locale, buildSheet, trackedSpelling) => {
      const translated = applyProtectedSample(
        locale,
        'Tracked-death regear in the Black Zone uses a Build Sheet for Fame Farming and Small Scale Ganking.',
      )
      expect(translated).toContain(`regear por morte ${trackedSpelling}`)
      expect(translated).toContain('zona negra')
      expect(translated).toContain(buildSheet)
      expect(translated).toContain('farm de fama')
      expect(translated).toContain('pequena escala')
      expect(translated).toContain('gank')
    },
  )

  it('restores protected terms with Polish Albion community vocabulary', () => {
    const translated = applyProtectedSample(
      'pl',
      'Manual regear in the Black Zone uses a Build Sheet for Fame Farming, Ganking, and Small Scale.',
    )
    expect(translated).toContain('ręczny regear')
    expect(translated).toContain('czarna strefa')
    expect(translated).toContain('arkusz buildów')
    expect(translated).toContain('fame farm')
    expect(translated).toContain('gankowanie')
    expect(translated).toContain('Small Scale')
  })

  it('restores protected terms with Russian Albion community vocabulary', () => {
    const translated = applyProtectedSample(
      'ru',
      'Manual regear in the Black Zone uses a Build Sheet, a Caller, and a Killboard.',
    )
    expect(translated).toContain('ручной регир')
    expect(translated).toContain('чёрная зона')
    expect(translated).toContain('таблица билдов')
    expect(translated).toContain('коллер')
    expect(translated).toContain('килборд')
  })

  it('restores protected terms with Italian Albion community vocabulary', () => {
    const translated = applyProtectedSample(
      'it',
      'Manual regear in the Black Zone uses a Build Sheet for Fame Farming, Ganking, and Small Scale.',
    )
    expect(translated).toContain('regear manuale')
    expect(translated).toContain('zona nera')
    expect(translated).toContain('foglio build')
    expect(translated).toContain('Fame Farm')
    expect(translated).toContain('ganking')
    expect(translated).toContain('Small Scale')
  })

  it('restores protected terms with Indonesian Albion community vocabulary', () => {
    const translated = applyProtectedSample(
      'id',
      'Auto regear in the Black Zone uses a Build Sheet, Gear, Fame Farming, Ganking, and Small Scale.',
    )
    expect(translated).toContain('regear otomatis')
    expect(translated).toContain('Black Zone')
    expect(translated).toContain('lembar build')
    expect(translated).toContain('gear')
    expect(translated).toContain('Fame Farm')
    expect(translated).toContain('ganking')
    expect(translated).toContain('Small Scale')
  })

  it('restores protected terms with Arabic Albion community vocabulary', () => {
    const translated = applyProtectedSample(
      'ar',
      'Auto regear in the Black Zone uses a Build Sheet, a Caller, Gear, Fame Farming, and Ganking.',
    )
    expect(translated).toContain('regear تلقائي')
    expect(translated).toContain('المنطقة السوداء')
    expect(translated).toContain('جدول Builds')
    expect(translated).toContain('Shotcaller')
    expect(translated).toContain('Gear')
    expect(translated).toContain('Fame Farm')
    expect(translated).toContain('Ganking')
  })

  it('restores protected terms with Turkish Albion community vocabulary', () => {
    const translated = applyProtectedSample(
      'tr',
      'Manual regear in the Black Zone uses a Build Sheet, a Caller, Fame Farming, and Small Scale.',
    )
    expect(translated).toContain('manuel regear')
    expect(translated).toContain('Black Zone')
    expect(translated).toContain('build tablosu')
    expect(translated).toContain('shotcaller')
    expect(translated).toContain('Fame Farm')
    expect(translated).toContain('Small Scale')
  })
})
