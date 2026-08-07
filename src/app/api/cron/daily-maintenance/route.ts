import { NextResponse } from 'next/server'
import { expireOverdueCraftTasks } from '@/lib/craft-tasks'
import {
  expireMemberTradeOrders,
  pruneCronRunHistory,
} from '@/lib/cron-maintenance'
import { withCronRun } from '@/lib/cron-run'
import { cleanupResolvedRegearScreenshots } from '@/lib/regear-screenshot-cleanup'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface TaskResult {
  status: 'succeeded' | 'failed'
  result?: unknown
  error?: string
}

async function runTask(task: () => Promise<unknown>): Promise<TaskResult> {
  try {
    return { status: 'succeeded', result: await task() }
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'daily-maintenance', leaseSeconds: 600 },
    async ({ db }) => {
      const tasks: Record<string, TaskResult> = {}
      tasks.screenshots = await runTask(() =>
        cleanupResolvedRegearScreenshots(db),
      )
      tasks.craft = await runTask(() => expireOverdueCraftTasks())
      tasks.memberTrades = await runTask(() => expireMemberTradeOrders(db))
      tasks.cronRuns = await runTask(() => pruneCronRunHistory(db))

      const ok = Object.values(tasks).every(
        (task) => task.status === 'succeeded',
      )
      return NextResponse.json({ ok, tasks }, { status: ok ? 200 : 500 })
    },
  )
}
