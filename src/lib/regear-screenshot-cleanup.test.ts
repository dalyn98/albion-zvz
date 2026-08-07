import { describe, expect, it, vi } from 'vitest'
import { cleanupResolvedRegearScreenshots } from '@/lib/regear-screenshot-cleanup'

function settingsQuery(rows: Array<{ guild_id: string }>) {
  const query = { select: vi.fn(), eq: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq
    .mockReturnValueOnce(query)
    .mockResolvedValueOnce({ data: rows, error: null })
  return query
}

describe('cleanupResolvedRegearScreenshots', () => {
  it('does not scan requests when no guild has regear support enabled', async () => {
    const from = vi.fn().mockReturnValue(settingsQuery([]))

    await expect(
      cleanupResolvedRegearScreenshots(
        { from } as never,
        new Date('2026-08-07T00:00:00.000Z'),
      ),
    ).resolves.toEqual({
      deleted: 0,
      cutoff: '2026-08-05T00:00:00.000Z',
    })
    expect(from).toHaveBeenCalledOnce()
  })

  it('removes both screenshot objects before clearing their database paths', async () => {
    const requests = {
      select: vi.fn(),
      in: vi.fn(),
      lt: vi.fn(),
      or: vi.fn(),
      limit: vi.fn(),
    }
    requests.select.mockReturnValue(requests)
    requests.in.mockReturnValue(requests)
    requests.lt.mockReturnValue(requests)
    requests.or.mockReturnValue(requests)
    requests.limit.mockResolvedValue({
      data: [
        { id: 'a', screenshot_path: 'a/1.webp', screenshot_path_2: 'a/2.webp' },
        { id: 'b', screenshot_path: null, screenshot_path_2: 'b/2.webp' },
      ],
      error: null,
    })

    const update = { update: vi.fn(), in: vi.fn() }
    update.update.mockReturnValue(update)
    update.in.mockResolvedValue({ error: null })
    const remove = vi.fn().mockResolvedValue({ error: null })
    const from = vi
      .fn()
      .mockReturnValueOnce(settingsQuery([{ guild_id: 'guild-1' }]))
      .mockReturnValueOnce(requests)
      .mockReturnValueOnce(update)

    await expect(
      cleanupResolvedRegearScreenshots(
        {
          from,
          storage: { from: vi.fn().mockReturnValue({ remove }) },
        } as never,
        new Date('2026-08-07T00:00:00.000Z'),
      ),
    ).resolves.toEqual({
      deleted: 3,
      cutoff: '2026-08-05T00:00:00.000Z',
    })
    expect(remove).toHaveBeenCalledWith(['a/1.webp', 'a/2.webp', 'b/2.webp'])
    expect(update.in).toHaveBeenCalledWith('id', ['a', 'b'])
  })
})
