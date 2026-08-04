'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createDiscordForumPost, createDiscordSupportMessage } from '@/lib/discord-support-rest'
import { loadSupportTicketSettings } from '@/lib/discord-support-ticket-service'
import { requireSuperAdmin } from '@/lib/super-admin'
import { logSuperAdminAction } from '@/lib/super-admin-audit'
import { getAdminClient } from '@/lib/supabase-admin'

const categorySchema = z.enum(['account', 'bot', 'battle', 'regear_shop', 'billing', 'bug', 'other'])
const statusSchema = z.enum(['investigating', 'identified', 'monitoring', 'resolved'])
const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export async function createSupportKnownIssue(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const supportGuildId = process.env.DISCORD_SUPPORT_GUILD_ID?.trim()
  if (!supportGuildId) throw new Error('DISCORD_SUPPORT_GUILD_ID is not configured')
  const parsed = z.object({
    slug: slugSchema,
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(1500),
    category: categorySchema,
  }).parse({
    slug: String(formData.get('slug') ?? ''),
    title: String(formData.get('title') ?? ''),
    summary: String(formData.get('summary') ?? ''),
    category: String(formData.get('category') ?? ''),
  })
  const settings = await loadSupportTicketSettings(supportGuildId)
  if (!settings?.known_issues_channel_id) throw new Error('Known-issues forum is not configured')
  const db = getAdminClient()
  const inserted = await db.from('support_known_issues').insert({
    support_guild_id: supportGuildId,
    slug: parsed.slug,
    title: parsed.title,
    public_summary: parsed.summary,
    category: parsed.category,
    status: 'investigating',
    created_by_discord_id: session.discordId,
    updated_by_discord_id: session.discordId,
  }).select('id').single()
  if (inserted.error) throw new Error(inserted.error.message)
  let forumPostId: string
  try {
    forumPostId = await createDiscordForumPost({
      forumChannelId: settings.known_issues_channel_id,
      name: parsed.title,
      content: [
        `**Status: Investigating**`,
        parsed.summary,
        '',
        `Reference: \`${parsed.slug}\``,
      ].join('\n'),
      auditReason: `Known issue ${parsed.slug} created`,
    })
  } catch (error) {
    await db.from('support_known_issues').delete().eq('id', inserted.data.id)
    throw error
  }
  const updated = await db.from('support_known_issues').update({
    forum_post_id: forumPostId,
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', inserted.data.id)
  if (updated.error) throw new Error(updated.error.message)
  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'support.known_issue.upsert',
    details: { knownIssueId: inserted.data.id, slug: parsed.slug, forumPostId },
  })
  revalidatePath('/super-admin/support')
}

export async function updateSupportKnownIssueStatus(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const parsed = z.object({
    id: z.string().uuid(),
    status: statusSchema,
  }).parse({
    id: String(formData.get('id') ?? ''),
    status: String(formData.get('status') ?? ''),
  })
  const db = getAdminClient()
  const current = await db.from('support_known_issues')
    .select('id, slug, title, forum_post_id, status')
    .eq('id', parsed.id)
    .single()
  if (current.error) throw new Error(current.error.message)
  const now = new Date().toISOString()
  const updated = await db.from('support_known_issues').update({
    status: parsed.status,
    resolved_at: parsed.status === 'resolved' ? now : null,
    updated_by_discord_id: session.discordId,
    updated_at: now,
  }).eq('id', parsed.id)
  if (updated.error) throw new Error(updated.error.message)
  if (current.data.forum_post_id) {
    await createDiscordSupportMessage(current.data.forum_post_id, {
      content: `**Status update: ${parsed.status.replace('_', ' ')}**\nUpdated by the support team.`,
      allowed_mentions: { parse: [] },
    })
  }
  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'support.known_issue.status',
    details: { knownIssueId: parsed.id, previous: current.data.status, current: parsed.status },
  })
  revalidatePath('/super-admin/support')
}
