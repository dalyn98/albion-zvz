import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/components/AutoRefresh.tsx'), 'utf8')

describe('AutoRefresh freshness contract', () => {
  it('uses the rendered fingerprint as the only confirmed baseline', () => {
    expect(source).toContain('resolveEventSnapshotPollAction')
    expect(source).toContain('resolveEventSnapshotPollDelayMs')
    expect(source).toContain("response.headers.get('Retry-After')")
    expect(source).toContain('fingerprintRef.current = initialFingerprint')
    expect(source).not.toContain('fingerprintRef.current = payload.fingerprint')
  })
})
