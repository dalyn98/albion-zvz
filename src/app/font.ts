import localFont from 'next/font/local'

export const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  preload: true,
  fallback: [
    '-apple-system',
    'BlinkMacSystemFont',
    'system-ui',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Noto Sans KR',
    'sans-serif',
  ],
})
