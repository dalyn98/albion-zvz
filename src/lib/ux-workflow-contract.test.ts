import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('workflow telemetry contract', () => {
  it('extends the database allowlist for workflow events and domain surfaces', () => {
    const migration = 'supabase/migrations/277_workflow_ux_telemetry.sql'
    expect(existsSync(join(process.cwd(), migration))).toBe(true)
    const sql = source(migration)
    for (const eventType of [
      'task_started',
      'validation_failed',
      'previewed',
      'submitted',
      'partial_failed',
      'completed',
      'undone',
      'abandoned',
    ]) {
      expect(sql).toContain(`'${eventType}'`)
    }
    for (const surface of ['admin_events', 'admin_tactics', 'craft', 'battles', 'onboarding']) {
      expect(sql).toContain(`'${surface}'`)
    }
  })

  it('lets async workflows report outcomes through the mounted tracker', () => {
    const tracker = source('src/components/UxTelemetryTracker.tsx')
    expect(tracker).toContain('ux-workflow-event')
    expect(tracker).toContain('UxWorkflowEventDetail')
    expect(tracker).toContain("document.addEventListener('ux-workflow-event'")
    expect(tracker).toContain("document.removeEventListener('ux-workflow-event'")
  })
})
