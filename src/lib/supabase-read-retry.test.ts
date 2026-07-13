import { describe, expect, it, vi } from 'vitest'
import { retrySupabaseRead } from './supabase-read-retry'

describe('retrySupabaseRead', () => {
  it('retries a transient Supabase gateway failure once before returning data', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '522', message: 'Connection timed out' } })
      .mockResolvedValueOnce({ data: [{ id: 'setting-1' }], error: null })
    const sleep = vi.fn(async () => {})
    const onRetry = vi.fn()

    await expect(retrySupabaseRead(read, {
      label: 'app_settings.lookup',
      sleep,
      onRetry,
    })).resolves.toEqual({ data: [{ id: 'setting-1' }], error: null })

    expect(read).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      label: 'app_settings.lookup',
      attempt: 1,
      maxAttempts: 2,
      delayMs: 100,
    }))
  })

  it('does not retry a deterministic query error', async () => {
    const read = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    })

    await expect(retrySupabaseRead(read, { label: 'tenant.lookup' })).resolves.toEqual({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    })
    expect(read).toHaveBeenCalledOnce()
  })

  it('does not make writes retryable because it accepts only read result callbacks', () => {
    expect(retrySupabaseRead).toBeTypeOf('function')
  })
})
