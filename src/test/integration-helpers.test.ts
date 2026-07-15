import { describe, expect, it } from 'vitest'
import { getValidatedTestSupabaseEnv } from './integration-helpers'

describe('integration test Supabase env safety', () => {
  it('keeps integration tests disabled when both env vars are absent', () => {
    expect(getValidatedTestSupabaseEnv({})).toBeNull()
  })

  it('requires URL and service key to be configured together', () => {
    expect(() =>
      getValidatedTestSupabaseEnv({
        TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
      }),
    ).toThrow('must be set together')
  })

  it('accepts local Supabase test credentials by default', () => {
    expect(
      getValidatedTestSupabaseEnv({
        TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
        TEST_SUPABASE_SERVICE_KEY: 'local-service-role',
      }),
    ).toEqual({
      url: 'http://127.0.0.1:54321',
      serviceKey: 'local-service-role',
    })

    expect(
      getValidatedTestSupabaseEnv({
        TEST_SUPABASE_URL: 'http://[::1]:54321',
        TEST_SUPABASE_SERVICE_KEY: 'local-service-role',
      }),
    ).toEqual({
      url: 'http://[::1]:54321',
      serviceKey: 'local-service-role',
    })
  })

  it('allows the app and integration tests to share the same local Supabase only', () => {
    expect(
      getValidatedTestSupabaseEnv({
        TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
        TEST_SUPABASE_SERVICE_KEY: 'local-service-role',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SERVICE_ROLE_KEY: 'local-service-role',
      }),
    ).toEqual({
      url: 'http://127.0.0.1:54321',
      serviceKey: 'local-service-role',
    })
  })

  it('blocks remote Supabase URLs unless explicitly opted in', () => {
    expect(() =>
      getValidatedTestSupabaseEnv({
        TEST_SUPABASE_URL: 'https://remote-test.supabase.co',
        TEST_SUPABASE_SERVICE_KEY: 'remote-service-role',
      }),
    ).toThrow('Remote TEST_SUPABASE_URL is blocked')

    expect(
      getValidatedTestSupabaseEnv({
        TEST_SUPABASE_URL: 'https://remote-test.supabase.co',
        TEST_SUPABASE_SERVICE_KEY: 'remote-service-role',
        ALLOW_REMOTE_TEST_SUPABASE: '1',
      }),
    ).toEqual({
      url: 'https://remote-test.supabase.co',
      serviceKey: 'remote-service-role',
    })
  })

  it('rejects production Supabase URL or service key reuse', () => {
    expect(() =>
      getValidatedTestSupabaseEnv({
        TEST_SUPABASE_URL: 'https://prod.supabase.co',
        TEST_SUPABASE_SERVICE_KEY: 'test-service-role',
        NEXT_PUBLIC_SUPABASE_URL: 'https://prod.supabase.co',
        ALLOW_REMOTE_TEST_SUPABASE: '1',
      }),
    ).toThrow('must not match NEXT_PUBLIC_SUPABASE_URL')

    expect(() =>
      getValidatedTestSupabaseEnv({
        TEST_SUPABASE_URL: 'https://remote-test.supabase.co',
        TEST_SUPABASE_SERVICE_KEY: 'prod-service-role',
        SUPABASE_SERVICE_ROLE_KEY: 'prod-service-role',
        ALLOW_REMOTE_TEST_SUPABASE: '1',
      }),
    ).toThrow('must not match SUPABASE_SERVICE_ROLE_KEY')
  })
})
