import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmBaseline } from './shop-baseline'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getTranslations: vi.fn(),
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  parseChestLog: vi.fn(),
  resolveKoItem: vi.fn(),
  logAdminAction: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/shop/parse-chest-log', () => ({
  parseChestLog: mocks.parseChestLog,
}))

vi.mock('@/lib/shop/resolve-item', () => ({
  resolveKoItem: mocks.resolveKoItem,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

interface QueryCall {
  table: string
  method: string
  args: unknown[]
}

function createBaselineDb() {
  const calls: QueryCall[] = []
  const rpc = vi.fn().mockResolvedValue({ data: 'baseline-1', error: null })
  const from = vi.fn((table: string) => {
    if (table !== 'shop_baselines') {
      throw new Error(`Unexpected table: ${table}`)
    }

    let selectedColumns = ''
    const query = {
      select(columns: string) {
        selectedColumns = columns
        calls.push({ table, method: 'select', args: [columns] })
        return query
      },
      eq(column: string, value: unknown) {
        calls.push({ table, method: 'eq', args: [column, value] })
        return query
      },
      maybeSingle() {
        calls.push({ table, method: 'maybeSingle', args: [] })
        if (selectedColumns === 'drift_report') {
          return Promise.resolve({
            data: {
              drift_report: {
                before_total: 1,
                after_total: 2,
                changed_items: 1,
                restored: 1,
                cleared: 0,
                increased: 0,
                decreased: 0,
                top_changes: [],
              },
            },
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      },
    }
    return query
  })

  return { db: { from, rpc }, calls, rpc }
}

describe('confirmBaseline', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.parseChestLog.mockReset()
    mocks.resolveKoItem.mockReset()
    mocks.logAdminAction.mockReset()

    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.parseChestLog.mockReturnValue({
      entries: [
        {
          loggedAt: new Date('2026-05-01T00:00:00.000Z'),
          player: 'PlayerOne',
          itemName: '테스트 장비',
          enchant: 0,
          quality: 1,
          quantity: 2,
        },
      ],
      errors: [],
    })
    mocks.resolveKoItem.mockReturnValue({
      uniqueName: 'T4_TEST_ITEM',
      nameKo: '테스트 장비',
      category: 'armor',
      tier: 4,
    })
  })

  it('scopes the drift report lookup by the current guild after applying a baseline', async () => {
    const { db, calls, rpc } = createBaselineDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    const result = await confirmBaseline({ raw: 'raw chest log' })

    expect(result.error).toBeUndefined()
    expect(result.driftReport).toMatchObject({
      beforeTotal: 1,
      afterTotal: 2,
      changedItems: 1,
    })
    expect(rpc).toHaveBeenCalledWith(
      'apply_shop_baseline',
      expect.objectContaining({ p_guild_id: 'guild-1' }),
    )

    const driftSelectIndex = calls.findIndex(
      (call) => call.method === 'select' && call.args[0] === 'drift_report',
    )
    expect(driftSelectIndex).toBeGreaterThanOrEqual(0)

    const driftReportCalls = calls.slice(driftSelectIndex)
    expect(driftReportCalls).toContainEqual({
      table: 'shop_baselines',
      method: 'eq',
      args: ['guild_id', 'guild-1'],
    })
    expect(driftReportCalls).toContainEqual({
      table: 'shop_baselines',
      method: 'eq',
      args: ['id', 'baseline-1'],
    })
  })
})
