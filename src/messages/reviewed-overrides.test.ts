import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function flattenStrings(
  value: Record<string, unknown>,
  prefix = '',
  output = new Map<string, string>(),
) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenStrings(child as Record<string, unknown>, path, output)
    } else if (typeof child === 'string') {
      output.set(path, child)
    }
  }
  return output
}

describe('reviewed message overrides', () => {
  it('references existing German message keys with matching placeholders', () => {
    const messagesDirectory = join(process.cwd(), 'src/messages')
    const source = flattenStrings(JSON.parse(readFileSync(join(messagesDirectory, 'en.json'), 'utf8')))
    const overrides = JSON.parse(
      readFileSync(join(messagesDirectory, 'reviewed-overrides/de.json'), 'utf8'),
    ) as Record<string, string>

    expect(Object.keys(overrides).length).toBeGreaterThan(0)
    for (const [key, value] of Object.entries(overrides)) {
      expect(source.has(key), key).toBe(true)
      expect(value.trim(), key).not.toBe('')
      const sourceTokens = source.get(key)?.match(/\{[^{}]+\}/g)?.sort() ?? []
      const targetTokens = value.match(/\{[^{}]+\}/g)?.sort() ?? []
      expect(targetTokens, key).toEqual(sourceTokens)
    }
  })
})
