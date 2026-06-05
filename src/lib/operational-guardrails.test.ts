import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function runMigrationDriftScript(migrationListOutput: string) {
  const tempDir = mkdtempSync(join(tmpdir(), 'albion-migration-drift-'))
  const binDir = join(tempDir, 'bin')
  const fixturePath = join(tempDir, 'migration-list.txt')
  const fakeSupabasePath = join(binDir, 'supabase')

  try {
    mkdirSync(binDir)
    writeFileSync(fixturePath, migrationListOutput)
    writeFileSync(
      fakeSupabasePath,
      `#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" == "migration" && "$2" == "list" ]]; then
  cat "$SUPABASE_MIGRATION_LIST_FIXTURE"
  exit 0
fi

if [[ "$1" == "link" ]]; then
  exit 0
fi

echo "unexpected supabase args: $*" >&2
exit 64
`,
    )
    chmodSync(fakeSupabasePath, 0o755)

    const result = spawnSync('bash', ['scripts/check-supabase-migration-drift.sh'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        SUPABASE_ACCESS_TOKEN: '',
        SUPABASE_DB_PASSWORD: '',
        SUPABASE_MIGRATION_LIST_FIXTURE: fixturePath,
        SUPABASE_PROJECT_REF: '',
      },
    })

    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

describe('operational guardrails', () => {
  it('pins CI and package runtime to the checked-in Node version', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      engines?: { node?: string; npm?: string }
      scripts: Record<string, string>
    }

    expect(read('.node-version').trim()).toBe('24')
    expect(read('.nvmrc').trim()).toBe('24')
    expect(packageJson.engines).toEqual({
      node: '>=24 <26',
      npm: '>=11 <12',
    })
    expect(read('.github/workflows/test.yml')).toContain('node-version-file: .node-version')
    expect(packageJson.scripts.typecheck).toBe('next typegen && tsc --noEmit')
    expect(read('.github/workflows/test.yml')).toContain('run: npm run typecheck')
    expect(read('.github/workflows/test.yml')).not.toContain('run: npx tsc --noEmit')
  })

  it('keeps prebuild deterministic unless Albion data refresh is explicit', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts.prebuild).not.toContain('AO_DATA_REFRESH=1')
    expect(packageJson.scripts['update:albion-data']).toContain('AO_DATA_REFRESH=1')

    const scripts = [
      { path: 'scripts/build-items.mjs', postGuardMarker: 'let raw' },
      { path: 'scripts/build-item-spells.mjs', postGuardMarker: 'let xml' },
      { path: 'scripts/build-spell-cooldowns.mjs', postGuardMarker: 'const spellsXml' },
    ]
    for (const { path: scriptPath, postGuardMarker } of scripts) {
      const source = read(scriptPath)
      const guardIndex = source.indexOf("process.env.AO_DATA_REFRESH !== '1'")
      const postGuardIndex = source.indexOf(postGuardMarker)
      expect(guardIndex, `${scriptPath} must check AO_DATA_REFRESH`).toBeGreaterThan(-1)
      expect(source, `${scriptPath} must keep the checked-in data path`).toContain('Using checked-in')
      expect(postGuardIndex, `${scriptPath} must keep refresh work after guard`).toBeGreaterThan(-1)
      expect(guardIndex, `${scriptPath} guard must run before refresh work`).toBeLessThan(postGuardIndex)
    }

    expect(read('scripts/build-spell-cooldowns.mjs')).toContain(
      "process.env.AO_DATA_REFRESH !== '1' && existsSync(cachePath)",
    )
  })

  it('keeps remote Supabase migration drift visible in CI', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }
    const workflow = read('.github/workflows/test.yml')
    const scriptPath = 'scripts/check-supabase-migration-drift.sh'
    const script = read(scriptPath)

    expect(packageJson.scripts['check:migrations:remote']).toBe(scriptPath)
    expect(workflow).toContain('migration-drift')
    expect(workflow).toContain('SUPABASE_PROJECT_REF')
    expect(workflow).toContain('SUPABASE_ACCESS_TOKEN')
    expect(workflow).toContain('skipping remote migration drift check')
    expect(workflow).toContain("steps.supabase-secrets.outputs.skip != 'true'")
    expect(workflow).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'")
    expect(workflow).toContain(scriptPath)
    expect(workflow).toContain('version: 2.104.0')
    expect(workflow).not.toContain('version: latest')
    expect(statSync(join(process.cwd(), scriptPath)).mode & 0o111).not.toBe(0)
    expect(script).toContain('Supabase migration drift detected')
    expect(script).toContain('exit 1')
  })

  it('keeps include-all migration push behind the safe backup wrapper', () => {
    const script = read('scripts/safe-db-push.sh')

    expect(script).toContain('SAFE_DB_PUSH_INCLUDE_ALL')
    expect(script).toContain('backup-db.sh')
    expect(script).toContain('push_args=(db push --linked)')
    expect(script).toContain('push_args+=(--include-all)')
    expect(script).toContain('supabase "${push_args[@]}"')
  })

  it('allows main-push migration drift only when local and remote versions match exactly', () => {
    const result = runMigrationDriftScript(`
Connecting to remote database...

   Local | Remote | Time (UTC)
  -------|--------|-----------
   000   | 000    | 2026-01-01 00:00:00
   179   | 179    | 2026-06-01 00:00:00
   180   | 180    | 2026-06-02 00:00:00
`)

    expect(result.status).toBe(0)
    expect(result.output).toContain('local and remote migrations match')
    expect(result.output).toContain('local=3 remote=3 latest=180')
  })

  it('fails main-push migration drift when a local migration has not been applied remotely', () => {
    const result = runMigrationDriftScript(`
   Local | Remote | Time (UTC)
  -------|--------|-----------
   000   | 000    | 2026-01-01 00:00:00
   179   | 179    | 2026-06-01 00:00:00
   180   |        |
`)

    expect(result.status).toBe(1)
    expect(result.output).toContain('Supabase migration drift detected')
    expect(result.output).toContain('local-only migration 180')
    expect(result.output).toContain('./scripts/safe-db-push.sh')
  })

  it('fails main-push migration drift when remote has a migration missing from the repo', () => {
    const result = runMigrationDriftScript(`
   Local | Remote | Time (UTC)
  -------|--------|-----------
   000   | 000    | 2026-01-01 00:00:00
   179   | 179    | 2026-06-01 00:00:00
         | 180    | 2026-06-02 00:00:00
`)

    expect(result.status).toBe(1)
    expect(result.output).toContain('Supabase migration drift detected')
    expect(result.output).toContain('remote-only migration 180')
    expect(result.output).toContain('recover the missing migration file')
  })

  it('fails closed if the Supabase migration list output cannot be parsed', () => {
    const result = runMigrationDriftScript(`
Supabase changed this output format.
No migration table rows are present.
`)

    expect(result.status).toBe(1)
    expect(result.output).toContain('Unable to parse Supabase migration list output')
  })
})
