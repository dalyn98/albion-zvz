import { getTranslations } from 'next-intl/server'
import { Download, Upload, AlertTriangle, Sparkles } from 'lucide-react'

// `/demo/backup` — `/admin/dashboard/backup` 의 정적 비주얼 클론.
// 실제 GuildBackupPanel 구조를 그대로 재현하되, 모든 액션 (export/import 트랜
// 잭션) 은 disabled. 사용자가 "데모 길드에서도 백업 화면을 그대로 볼 수 있다" 는
// 점을 확인할 수 있게 한다. 가짜 preview 도 보여주지 않는다 — 빈 상태가 가장
// 정직한 미리보기.
export default async function DemoBackupPage() {
  const [t, tDemo] = await Promise.all([
    getTranslations('adminBackup'),
    getTranslations('demo.backup'),
  ])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">{t('pageTitle')}</h1>
        <p className="mt-1 text-sm text-gray-400">{t('pageSubtitle')}</p>
      </header>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemo('demoNotice')}</p>
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-white">{t('exportTitle')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('exportHint')}</p>
        </header>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-md bg-amber-500 text-black px-4 py-2 text-sm font-medium cursor-not-allowed opacity-60"
        >
          <Download size={16} />
          {t('exportButton')}
        </button>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4">
        <header>
          <h2 className="text-lg font-semibold text-white">{t('importTitle')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('importHint')}</p>
        </header>

        <div className="inline-flex items-center gap-2 rounded-md border border-gray-700 bg-gray-950 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed opacity-70">
          <Upload size={16} />
          {t('importPickFile')}
        </div>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>{t('previewWarning')}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
