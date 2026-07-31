import { describe, expect, it, vi } from 'vitest'
import {
  processDueTenantPurges,
  purgeTenantStorage,
} from './tenant-lifecycle-purge'

function queryResult(data: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

describe('tenant lifecycle purge worker', () => {
  it('removes tenant-prefixed and legacy referenced screenshots without touching unrelated paths', async () => {
    const regearQuery = queryResult([
      {
        screenshot_path: 'legacy-member/regear.webp',
        screenshot_path_2: null,
      },
    ])
    const donationQuery = queryResult([
      { screenshot_path: 'legacy-member/donation.webp' },
    ])
    const removeByBucket = new Map<string, ReturnType<typeof vi.fn>>()
    const storage = {
      from: vi.fn((bucket: string) => {
        const remove =
          removeByBucket.get(bucket) ??
          vi.fn().mockResolvedValue({ error: null })
        removeByBucket.set(bucket, remove)
        return {
          list: vi.fn(
            async (prefix: string) => {
              if (
                bucket === 'regear-screenshots' &&
                prefix === 'guild-1'
              ) {
                return {
                  data: [
                    { name: 'member-a', id: null, metadata: null },
                    { name: 'root.webp', id: 'file-root' },
                  ],
                  error: null,
                }
              }
              if (
                bucket === 'regear-screenshots' &&
                prefix === 'guild-1/member-a'
              ) {
                return {
                  data: [{ name: 'nested.webp', id: 'file-nested' }],
                  error: null,
                }
              }
              return { data: [], error: null }
            },
          ),
          remove,
        }
      }),
    }
    const db = {
      from: vi.fn((table: string) =>
        table === 'regear_requests' ? regearQuery : donationQuery,
      ),
      storage,
    }

    const receipt = await purgeTenantStorage(
      db as never,
      'guild-1',
    )

    expect(receipt['regear-screenshots']).toBe(3)
    expect(receipt['donation-screenshots']).toBe(1)
    expect(
      removeByBucket.get('regear-screenshots'),
    ).toHaveBeenCalledWith(
      expect.arrayContaining([
        'guild-1/root.webp',
        'guild-1/member-a/nested.webp',
        'legacy-member/regear.webp',
      ]),
    )
    const allRemoved = Array.from(removeByBucket.values()).flatMap(
      (remove) => remove.mock.calls.flatMap((call) => call[0] as string[]),
    )
    expect(
      allRemoved.some((path) => path.startsWith('other-guild/')),
    ).toBe(false)
  })

  it('releases the claim and never finalizes when storage cleanup fails', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            request_id: 'request-1',
            guild_id: 'guild-1',
            claim_token: 'claim-1',
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null })
    const db = {
      rpc,
      from: vi.fn(() => queryResult([])),
      storage: {
        from: vi.fn(() => ({
          list: vi.fn().mockResolvedValue({
            data: null,
            error: { statusCode: 500, message: 'storage unavailable' },
          }),
          remove: vi.fn(),
        })),
      },
    }

    const result = await processDueTenantPurges(db as never)

    expect(result).toEqual({
      claimed: 1,
      purged: 0,
      failed: 1,
      storageObjectsRemoved: 0,
    })
    expect(rpc).toHaveBeenCalledWith(
      'release_tenant_deletion_claim',
      {
        p_request_id: 'request-1',
        p_claim_token: 'claim-1',
        p_error: expect.stringMatching(/^storage_/),
      },
    )
    expect(
      rpc.mock.calls.some(
        ([name]) => name === 'finalize_tenant_purge',
      ),
    ).toBe(false)
  })
})
