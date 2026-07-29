import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('public guild profile privacy boundary wiring', () => {
  const page = source(
    'src/app/(app-shell)/public/(marketing)/g/[slug]/page.tsx',
  )
  const hero = source('src/components/guild/GuildProfileHero.tsx')
  const settingsAction = source('src/app/actions/settings.ts')
  const adminPage = source(
    'src/app/(app-shell)/admin/dashboard/guild-profile/page.tsx',
  )

  it('closes direct URLs before any shared public data is loaded', () => {
    const privateGate = page.indexOf("if (accessState === 'private')")
    const dataLoad = page.indexOf('loadCachedPublicGuildProfileData(', privateGate)

    expect(privateGate).toBeGreaterThan(-1)
    expect(page.slice(privateGate, dataLoad)).toContain(
      'if (!isOwnGuildAdmin) notFound()',
    )
    expect(dataLoad).toBeGreaterThan(privateGate)
  })

  it('gates identifying and economic queries with the resolved exposure model', () => {
    expect(page).toContain(
      'exposure.topContributors',
    )
    expect(page).toContain(
      'exposure.adminTeam ? loadAdminTeam(guildId) : Promise.resolve([])',
    )
    expect(page).toContain('showRegearStats: exposure.regearStats')
  })

  it('renders the Discord CTA from the verified join URL, not the raw setting', () => {
    expect(hero).toContain('discordJoinUrl.length > 0')
    expect(hero).toContain('href={discordJoinUrl}')
    expect(hero).not.toContain('href={settings.discordInviteUrl}')
    expect(settingsAction).toContain(
      "key: 'guild_profile_discord_invite_guild_id'",
    )
  })

  it('keeps private metadata free of guild identity and share previews', () => {
    const metadataStart = page.indexOf('export async function generateMetadata')
    const pageStart = page.indexOf('export default async function GuildProfilePage')
    const metadata = page.slice(metadataStart, pageStart)

    expect(metadata).toContain("if (accessState !== 'public' || !settings)")
    expect(metadata).toContain("title: tMeta('ogSiteName')")
    expect(metadata).toContain('robots: { index: false, follow: false }')
  })

  it('lets admins review section exposure before enabling the profile', () => {
    expect(adminPage).not.toContain('if (!settings.enabled)')
    expect(adminPage.indexOf('<GuildProfileVisibilityEditor')).toBeLessThan(
      adminPage.indexOf('<GuildProfileEnableToggle'),
    )
  })
})
