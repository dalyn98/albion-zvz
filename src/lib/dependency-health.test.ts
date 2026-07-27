import { describe, expect, it } from 'vitest'
import { getDependencyHealth } from './dependency-health'

type QueryResult = { data: unknown; error: unknown }

function makeDb(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            limit() {
              return Promise.resolve(results[table] ?? { data: [], error: null })
            },
            order() {
              return {
                limit() {
                  return Promise.resolve(results[table] ?? { data: [], error: null })
                },
              }
            },
          }
        },
      }
    },
  }
}

describe('dependency health', () => {
  it('returns ok when Supabase REST checks pass', async () => {
    const health = await getDependencyHealth({
      db: makeDb({
        tenants: { data: [{ id: 'tenant-1' }], error: null },
        app_settings: { data: [{ key: 'albion_server' }], error: null },
        battle_engagement_runs: { data: [], error: null },
        guild_battle_stat_units: { data: [], error: null },
      }),
      now: () => 123,
    })

    expect(health.ok).toBe(true)
    expect(health.status).toBe('ok')
    expect(health.ts).toBe(123)
    expect(health.checks.map((check) => check.status)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
    ])
  })

  it('marks schema cache failures as down without leaking raw query details', async () => {
    const health = await getDependencyHealth({
      db: makeDb({
        tenants: {
          data: null,
          error: { code: 'PGRST002', message: 'Could not query schema cache for public.tenants' },
        },
        app_settings: { data: [], error: null },
        battle_engagement_runs: { data: [], error: null },
        guild_battle_stat_units: { data: [], error: null },
      }),
    })

    expect(health.ok).toBe(false)
    expect(health.status).toBe('down')
    expect(health.checks[0]).toMatchObject({
      name: 'supabase_rest_tenants',
      status: 'down',
      code: 'PGRST002',
      message: 'Supabase schema cache is unavailable',
    })
  })

  it('includes recent cron runs only when requested', async () => {
    const health = await getDependencyHealth({
      includeCron: true,
      db: makeDb({
        tenants: { data: [], error: null },
        app_settings: { data: [], error: null },
        battle_engagement_runs: { data: [], error: null },
        guild_battle_stat_units: { data: [], error: null },
        cron_runs: {
          data: [
            {
              job_name: 'auto-regear',
              status: 'failed',
              started_at: '2026-06-07T00:00:00.000Z',
              completed_at: '2026-06-07T00:00:01.000Z',
              error: 'boom',
            },
          ],
          error: null,
        },
      }),
    })

    expect(health.cronRuns).toEqual([
      {
        jobName: 'auto-regear',
        status: 'failed',
        startedAt: '2026-06-07T00:00:00.000Z',
        completedAt: '2026-06-07T00:00:01.000Z',
        error: 'boom',
      },
    ])
  })
})
