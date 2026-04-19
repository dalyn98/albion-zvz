import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'

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
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminClient()
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString()

  const { data: rows, error: selectError } = await db
    .from('regear_requests')
    .select('id, screenshot_path')
    .in('status', ['approved', 'rejected'])
    .lt('resolved_at', cutoff)
    .not('screenshot_path', 'is', null)
    .limit(BATCH_LIMIT)

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 })
  }

  const targets = (rows ?? []).filter((r): r is { id: string; screenshot_path: string } =>
    typeof r.screenshot_path === 'string' && r.screenshot_path.length > 0,
  )
  if (targets.length === 0) {
    return NextResponse.json({ deleted: 0, cutoff })
  }

  const paths = targets.map((r) => r.screenshot_path)
  const { error: removeError } = await db.storage.from(SCREENSHOT_BUCKET).remove(paths)
  if (removeError) {
    // If storage delete fails, we deliberately do NOT null the DB rows — we
    // want to retry next run rather than losing the reference to the object.
    return NextResponse.json({ error: removeError.message }, { status: 500 })
  }

  const ids = targets.map((r) => r.id)
  const { error: updateError } = await db
    .from('regear_requests')
    .update({ screenshot_path: null })
    .in('id', ids)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: targets.length, cutoff })
}
