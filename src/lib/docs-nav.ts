// docs 사이드바·페이지 prev/next·sitemap 의 단일 소스. 새 docs 페이지를 추가할
// 때는 여기에 slug 와 i18n 키를 등록하면 sidebar/페이지 폴더가 자동으로 따라온다
// (페이지 폴더 자체는 별도로 만들어야 함 — 라우팅 자체는 파일 시스템 기반).

export interface DocsNavItem {
  slug: string
  itemKey: string
  subItems?: DocsNavItem[]
}

export interface DocsNavSection {
  sectionKey: string
  items: DocsNavItem[]
}

export const DOCS_NAV: DocsNavSection[] = [
  {
    sectionKey: 'sectionGettingStarted',
    items: [{ slug: '', itemKey: 'intro' }],
  },
  {
    sectionKey: 'sectionFeatures',
    items: [
      {
        slug: 'onboarding',
        itemKey: 'onboarding',
        subItems: [
          { slug: 'onboarding/invite', itemKey: 'onboardingInvite' },
          { slug: 'onboarding/login', itemKey: 'onboardingLogin' },
          { slug: 'onboarding/setup-wizard', itemKey: 'onboardingWizard' },
          { slug: 'onboarding/character-link', itemKey: 'onboardingCharacterLink' },
        ],
      },
      {
        slug: 'members',
        itemKey: 'members',
        subItems: [
          { slug: 'members/list', itemKey: 'membersList' },
          { slug: 'members/detail', itemKey: 'membersDetail' },
          { slug: 'members/sync', itemKey: 'membersSync' },
          { slug: 'members/guest', itemKey: 'membersGuest' },
        ],
      },
      {
        slug: 'killboard',
        itemKey: 'killboard',
        subItems: [
          { slug: 'killboard/sync', itemKey: 'killboardSync' },
          { slug: 'killboard/scope', itemKey: 'killboardScope' },
          { slug: 'killboard/member-view', itemKey: 'killboardMemberView' },
          { slug: 'killboard/battle-view', itemKey: 'killboardBattleView' },
        ],
      },
      {
        slug: 'battles',
        itemKey: 'battles',
        subItems: [
          { slug: 'battles/list', itemKey: 'battlesList' },
          { slug: 'battles/detail', itemKey: 'battlesDetail' },
        ],
      },
      {
        slug: 'regear',
        itemKey: 'regear',
        subItems: [
          { slug: 'regear/auto', itemKey: 'regearAuto' },
          { slug: 'regear/manual', itemKey: 'regearManual' },
          { slug: 'regear/dual-mode', itemKey: 'regearDualMode' },
          { slug: 'regear/verification', itemKey: 'regearVerification' },
          { slug: 'regear/admin-approval', itemKey: 'regearAdminApproval' },
        ],
      },
      {
        slug: 'shop',
        itemKey: 'shop',
        subItems: [
          { slug: 'shop/storefront', itemKey: 'shopStorefront' },
          { slug: 'shop/exchange-rate', itemKey: 'shopExchangeRate' },
          { slug: 'shop/points', itemKey: 'shopPoints' },
          { slug: 'shop/box-pickup', itemKey: 'shopBoxPickup' },
        ],
      },
      {
        slug: 'craft',
        itemKey: 'craft',
        subItems: [
          { slug: 'craft/queue', itemKey: 'craftQueue' },
          { slug: 'craft/my-tasks', itemKey: 'craftMyTasks' },
          { slug: 'craft/inventory', itemKey: 'craftInventory' },
          { slug: 'craft/box-pickup', itemKey: 'craftBoxPickup' },
        ],
      },
      {
        slug: 'leaderboard',
        itemKey: 'leaderboard',
        subItems: [
          { slug: 'leaderboard/badges', itemKey: 'leaderboardBadges' },
          { slug: 'leaderboard/weapon-stats', itemKey: 'leaderboardWeaponStats' },
          { slug: 'leaderboard/ranking', itemKey: 'leaderboardRanking' },
        ],
      },
      {
        slug: 'dashboard',
        itemKey: 'dashboard',
        subItems: [
          { slug: 'dashboard/home', itemKey: 'dashboardHome' },
          { slug: 'dashboard/profile', itemKey: 'dashboardProfile' },
          { slug: 'dashboard/settings', itemKey: 'dashboardSettings' },
          { slug: 'dashboard/siphon', itemKey: 'dashboardSiphon' },
          { slug: 'dashboard/regear-detail', itemKey: 'dashboardRegearDetail' },
          { slug: 'dashboard/requests', itemKey: 'dashboardRequests' },
        ],
      },
      {
        slug: 'public-profile',
        itemKey: 'publicProfile',
      },
      {
        slug: 'admin',
        itemKey: 'admin',
        subItems: [
          { slug: 'admin/dashboard', itemKey: 'adminDashboard' },
          { slug: 'admin/global-toggles', itemKey: 'adminGlobalToggles' },
          { slug: 'admin/permissions', itemKey: 'adminPermissions' },
          { slug: 'admin/in-app-guide', itemKey: 'adminInAppGuide' },
        ],
      },
    ],
  },
]

export function flattenDocsNav(): DocsNavItem[] {
  return DOCS_NAV.flatMap((section) =>
    section.items.flatMap((item) => [item, ...(item.subItems ?? [])]),
  )
}
