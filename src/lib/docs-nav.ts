// docs 사이드바·페이지 prev/next·sitemap 의 단일 소스. 새 docs 페이지를 추가할
// 때는 여기에 slug 와 i18n 키를 등록하면 sidebar/페이지 폴더가 자동으로 따라온다
// (페이지 폴더 자체는 별도로 만들어야 함 — 라우팅 자체는 파일 시스템 기반).

export interface DocsNavItem {
  // '' 면 인덱스 (`/docs`), 그 외는 `/docs/<slug>`. 슬래시는 항상 layout 의
  // marketing-paths 와 합쳐서 host 에 맞는 prefix 를 붙인다.
  slug: string
  // src/messages/{ko,ja,en}.json 의 docsNav namespace 키. 본문은 ko 우선이지만
  // sidebar 라벨은 사이트 chrome 이라 i18n 동등 키 유지.
  itemKey: string
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
      { slug: 'onboarding', itemKey: 'onboarding' },
      { slug: 'members', itemKey: 'members' },
      { slug: 'killboard', itemKey: 'killboard' },
      { slug: 'battles', itemKey: 'battles' },
      { slug: 'regear', itemKey: 'regear' },
      { slug: 'shop', itemKey: 'shop' },
      { slug: 'craft', itemKey: 'craft' },
      { slug: 'leaderboard', itemKey: 'leaderboard' },
      { slug: 'dashboard', itemKey: 'dashboard' },
      { slug: 'admin', itemKey: 'admin' },
    ],
  },
]

export function flattenDocsNav(): DocsNavItem[] {
  return DOCS_NAV.flatMap((section) => section.items)
}
