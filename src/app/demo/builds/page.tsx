import { getTranslations } from 'next-intl/server'
import { Plus, Shield, Swords, WandSparkles } from 'lucide-react'
import ItemImage from '@/components/ItemImage'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import { CATEGORY_I18N_SLUG } from '@/types'

const BUILDS_TOUR_STEPS = [
  { id: 'builds-header' },
  { id: 'builds-filter' },
  { id: 'builds-grid' },
] as const

const DEMO_BUILDS = [
  {
    name: 'Locus 8.1 Resist',
    roleKey: 'support',
    icon: WandSparkles,
    items: [
      ['T8_2H_ARCANE_RINGPAIR_AVALON', 'Locus'],
      ['T8_HEAD_PLATE_SET2', 'Knight Helmet'],
      ['T8_ARMOR_PLATE_KEEPER', 'Judicator Armor'],
      ['T8_SHOES_LEATHER_SET1', 'Hunter Shoes'],
    ],
  },
  {
    name: 'Heavy Mace Engage',
    roleKey: 'deftank',
    icon: Shield,
    items: [
      ['T8_2H_MACE', 'Heavy Mace'],
      ['T8_HEAD_PLATE_KEEPER', 'Judicator Helmet'],
      ['T8_ARMOR_PLATE_KEEPER', 'Judicator Armor'],
      ['T8_SHOES_LEATHER_SET1', 'Hunter Shoes'],
    ],
  },
  {
    name: 'Brimstone Clump DPS',
    roleKey: 'dps',
    icon: Swords,
    items: [
      ['T8_2H_FIRESTAFF_HELL', 'Brimstone Staff'],
      ['T8_HEAD_CLOTH_ROYAL', 'Royal Hood'],
      ['T8_ARMOR_CLOTH_SET2', 'Cleric Robe'],
      ['T8_SHOES_CLOTH_SET1', 'Scholar Sandals'],
    ],
  },
] as const

export default async function DemoBuildsPage() {
  const [t, tTemplates, tCta, tRole] = await Promise.all([
    getTranslations('adminBuildTemplates'),
    getTranslations('adminTemplates'),
    getTranslations('demo.ctaCard'),
    getTranslations('slotRole'),
  ])

  return (
    <div className="space-y-5">
      <DemoGuidedTour steps={BUILDS_TOUR_STEPS} namespace="builds" />
      <div data-tour-id="builds-header" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('pageTitle')}</h1>
          <p className="text-gray-400 text-sm max-w-3xl">{t('pageDescription')}</p>
        </div>
        <DemoActionButton className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400">
          <Plus size={14} />
          {t('createButton')}
        </DemoActionButton>
      </div>

      <div
        data-tour-id="builds-filter"
        className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-gray-400"
      >
        {t('searchPlaceholder')} · {tRole('dps')} / {tRole('deftank')} / {tRole('support')}
      </div>

      <div data-tour-id="builds-grid" className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {DEMO_BUILDS.map((build) => {
          const Icon = build.icon
          return (
            <article key={build.name} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">{build.name}</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {tTemplates(`slotTemplateCategory_${CATEGORY_I18N_SLUG['전투']}`)} · {tRole(build.roleKey)}
                  </p>
                </div>
                <Icon size={18} className="text-amber-300" />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {build.items.map(([itemId, itemName]) => (
                  <div key={itemId} className="rounded-lg border border-gray-800 bg-gray-950 p-1">
                    <ItemImage itemId={itemId} itemName={itemName} size={42} hoverPreview />
                  </div>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-gray-500">{t('editDescription')}</p>
            </article>
          )
        })}
      </div>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('events.title')}
        description={tCta('events.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
