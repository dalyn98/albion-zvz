import { getTranslations } from 'next-intl/server'
import { Download, Upload, AlertTriangle, FileArchive, Sparkles } from 'lucide-react'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'

const BACKUP_TOUR_STEPS = [
  { id: 'backup-export' },
  { id: 'backup-import' },
] as const

// `/demo/backup` — `/admin/dashboard/backup` 의 정적 비주얼 클론.
// 복구와 템플릿 공유의 경계를 보여주되 모든 mutation 은 disabled 상태다.
export default async function DemoBackupPage() {
  const [t, tDemo, tCta] = await Promise.all([
    getTranslations('adminBackup'),
    getTranslations('demo.backup'),
    getTranslations('demo.ctaCard'),
  ])

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={BACKUP_TOUR_STEPS} namespace="backup" />
      <header>
        <h1 className="text-2xl font-semibold text-white">{t('pageTitle')}</h1>
        <p className="mt-1 text-sm text-gray-400">{t('pageSubtitle')}</p>
      </header>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemo('demoNotice')}</p>
      </div>

      <section data-tour-id="backup-export" className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-white">{t('recoveryExportTitle')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('recoveryExportHint')}</p>
        </header>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-gray-800 bg-gray-950 p-3">
            <p className="font-medium text-white">{t('includedTitle')}</p>
            <p className="mt-1 text-gray-400">{t('includedItems')}</p>
          </div>
          <div className="rounded-md border border-gray-800 bg-gray-950 p-3">
            <p className="font-medium text-white">{t('excludedTitle')}</p>
            <p className="mt-1 text-gray-400">{t('excludedItems')}</p>
          </div>
        </div>
        <DemoActionButton className="inline-flex items-center gap-2 rounded-md bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 text-sm font-medium transition-colors">
          <Download size={16} />
          {t('recoveryExportButton')}
        </DemoActionButton>
      </section>

      <section data-tour-id="backup-import" className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-white">{t('recoveryImportTitle')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('recoveryImportHint')}</p>
        </header>

        <DemoActionButton
          asDiv
          className="inline-flex items-center gap-2 rounded-md border border-gray-700 hover:border-amber-500/50 bg-gray-950 hover:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-200 transition-colors"
        >
          <Upload size={16} />
          {t('recoveryPickFile')}
        </DemoActionButton>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>{t('recoveryWarning')}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">{t('serverSafetyNote')}</p>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
        <header>
          <div className="flex items-center gap-2">
            <FileArchive size={18} className="text-amber-400" />
            <h2 className="text-lg font-semibold text-white">{t('templateTitle')}</h2>
          </div>
          <p className="mt-1 text-sm text-gray-400">{t('templateHint')}</p>
        </header>
        <DemoActionButton className="inline-flex items-center gap-2 rounded-md border border-gray-700 bg-gray-950 px-4 py-2 text-sm font-medium text-gray-200">
          <Download size={16} />
          {t('templateExportButton')}
        </DemoActionButton>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('backup.title')}
        description={tCta('backup.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
