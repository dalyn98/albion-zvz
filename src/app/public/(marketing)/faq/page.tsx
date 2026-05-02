import { HelpCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import MarketingNav from '@/components/MarketingNav'

export const dynamic = 'force-dynamic'

const FAQ_KEYS = [
  'q1', 'q2', 'q3', 'q4', 'q5', 'q6',
  'q7', 'q8', 'q9', 'q10', 'q11', 'q12',
  'q13', 'q14', 'q15', 'q16', 'q17', 'q18',
] as const
type FaqKey = (typeof FAQ_KEYS)[number]
type FaqAnswerKey =
  | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6'
  | 'a7' | 'a8' | 'a9' | 'a10' | 'a11' | 'a12'
  | 'a13' | 'a14' | 'a15' | 'a16' | 'a17' | 'a18'
const FAQ_ANSWER_KEY: Record<FaqKey, FaqAnswerKey> = {
  q1: 'a1', q2: 'a2', q3: 'a3', q4: 'a4', q5: 'a5', q6: 'a6',
  q7: 'a7', q8: 'a8', q9: 'a9', q10: 'a10', q11: 'a11', q12: 'a12',
  q13: 'a13', q14: 'a14', q15: 'a15', q16: 'a16', q17: 'a17', q18: 'a18',
}

export default async function PublicFaqPage() {
  const tFaq = await getTranslations('publicFaq')
  return (
    <>
      <MarketingNav />
      <div className="bg-[#0b0d12] text-gray-100 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
          <div className="text-center space-y-3">
            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
              {tFaq('pageSubtitle')}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              {tFaq('pageTitle')}
            </h1>
          </div>

          <div className="space-y-3">
            {FAQ_KEYS.map((qKey) => (
              <details
                key={qKey}
                className="group rounded-xl border border-gray-800 bg-gray-900/60 px-5 py-4 open:bg-gray-900/80"
              >
                <summary className="flex items-start gap-3 cursor-pointer list-none text-sm font-semibold text-white">
                  <HelpCircle
                    size={16}
                    className="text-amber-300 mt-0.5 flex-shrink-0"
                  />
                  <span className="flex-1">{tFaq(qKey)}</span>
                  <span className="text-gray-500 group-open:rotate-180 transition-transform text-xs">
                    ▼
                  </span>
                </summary>
                <p className="mt-3 ml-7 text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                  {tFaq(FAQ_ANSWER_KEY[qKey])}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
