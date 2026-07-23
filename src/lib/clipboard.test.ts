import { describe, expect, it, vi } from 'vitest'
import { copyTextWithFallback } from './clipboard'

describe('copyTextWithFallback', () => {
  it('uses the async Clipboard API when it succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const execCommand = vi.fn()

    await expect(copyTextWithFallback('https://example.test/path', {
      writeText,
      createTextArea: vi.fn(),
      execCommand,
    })).resolves.toBe(true)

    expect(writeText).toHaveBeenCalledWith('https://example.test/path')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('falls back to a selected textarea when the Clipboard API is blocked', async () => {
    const select = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    const textarea = { select, remove }
    const execCommand = vi.fn().mockReturnValue(true)

    await expect(copyTextWithFallback('https://example.test/path', {
      writeText: vi.fn().mockRejectedValue(new Error('blocked')),
      createTextArea: vi.fn(() => textarea),
      append,
      execCommand,
    })).resolves.toBe(true)

    expect(append).toHaveBeenCalledWith(textarea)
    expect(select).toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(remove).toHaveBeenCalled()
  })

  it('reports failure so the UI can expose a manually selectable URL', async () => {
    await expect(copyTextWithFallback('https://example.test/path', {
      writeText: vi.fn().mockRejectedValue(new Error('blocked')),
      createTextArea: vi.fn(() => ({ select: vi.fn(), remove: vi.fn() })),
      append: vi.fn(),
      execCommand: vi.fn().mockReturnValue(false),
    })).resolves.toBe(false)
  })
})
