import { HelpCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import MarketingNav from '@/components/MarketingNav'

export const dynamic = 'force-dynamic'

const QUESTION_KEYS = [
  'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8',
  'q9', 'q10', 'q11', 'q12',
] as const
type QuestionKey = (typeof QUESTION_KEYS)[number]
type AnswerKey =
  | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7' | 'a8'
  | 'a9' | 'a10' | 'a11' | 'a12'

const ANSWER_KEY_FOR: Record<QuestionKey, AnswerKey> = {
  q1: 'a1', q2: 'a2', q3: 'a3', q4: 'a4',
  q5: 'a5', q6: 'a6', q7: 'a7', q8: 'a8',
  q9: 'a9', q10: 'a10', q11: 'a11', q12: 'a12',
}

export default async function PublicFaqPage() {
  const t = await getTranslations('publicFaq')

  return (
    <>
      <MarketingNav active="faq" />
      <div className="bg-[#0f1117] text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 py-12 sm:py-16 space-y-10">
          <section className="text-center space-y-4">
            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
              {t('pageSubtitle')}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{t('pageTitle')}</h1>
          </section>

          <section className="space-y-3">
            {QUESTION_KEYS.map((qKey) => (
              <details
                key={qKey}
                className="group rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4 open:bg-gray-900/80"
              >
                <summary className="flex items-start gap-3 cursor-pointer list-none text-sm font-semibold text-white">
                  <HelpCircle
                    size={16}
                    className="text-amber-300 mt-0.5 flex-shrink-0"
                  />
                  <span className="flex-1">{t(qKey)}</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform text-xs">
                    ▼
                  </span>
                </summary>
                <p className="mt-3 ml-7 text-sm text-gray-300 leading-relaxed">
                  {t(ANSWER_KEY_FOR[qKey])}
                </p>
              </details>
            ))}
          </section>
        </div>
      </div>
    </>
  )
}
