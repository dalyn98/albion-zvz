import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'

// Screenshots are only useful while the admin is reviewing. Once a request is
// approved/rejected we keep the row for history but drop the storage object
// after 48h to save Supabase storage quota.
//
// Invoked by Vercel Cron (see vercel.json) with the Authorization bearer header
// `CRON_SECRET`. Also callable manually via the same header for ad-hoc cleanup.

const SCREENSHOT_BUCKET = 'regear-screenshots'
const RETENTION_HOURS = 48
// Cap the number of storage deletes per run so a backlog can't time out the
// cron invocation. 500 is well under Supabase's per-request limits and covers
// multiple days of normal guild volume.
const BATCH_LIMIT = 500

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'cleanup-screenshots', leaseSeconds: 300 }, async ({ db }) => {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString()

    const { data: rows, error: selectError } = await db
      .from('regear_requests')
      .select('id, screenshot_path, screenshot_path_2')
      .in('status', ['approved', 'rejected'])
      .lt('resolved_at', cutoff)
      .or('screenshot_path.not.is.null,screenshot_path_2.not.is.null')
      .limit(BATCH_LIMIT)

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 })
    }

    // 한 row 에 1장 혹은 2장이 들어있을 수 있음. 둘 다 정리 대상.
    const targets = (rows ?? []).filter(
      (r) =>
        (typeof r.screenshot_path === 'string' && r.screenshot_path.length > 0) ||
        (typeof r.screenshot_path_2 === 'string' && r.screenshot_path_2.length > 0),
    )
    if (targets.length === 0) {
      return NextResponse.json({ deleted: 0, cutoff })
    }

    const paths: string[] = []
    for (const r of targets) {
      if (typeof r.screenshot_path === 'string' && r.screenshot_path.length > 0) {
        paths.push(r.screenshot_path)
      }
      if (typeof r.screenshot_path_2 === 'string' && r.screenshot_path_2.length > 0) {
        paths.push(r.screenshot_path_2)
      }
    }
    const { error: removeError } = await db.storage.from(SCREENSHOT_BUCKET).remove(paths)
    if (removeError) {
      // If storage delete fails, we deliberately do NOT null the DB rows — we
      // want to retry next run rather than losing the reference to the object.
      return NextResponse.json({ error: removeError.message }, { status: 500 })
    }

    const ids = targets.map((r) => r.id)
    const { error: updateError } = await db
      .from('regear_requests')
      .update({ screenshot_path: null, screenshot_path_2: null })
      .in('id', ids)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ deleted: paths.length, cutoff })
  })
}
