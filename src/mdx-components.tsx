import type { MDXComponents } from 'mdx/types'
import Link from 'next/link'

// docs MDX 본문에 매핑되는 dark-theme 컴포넌트. tailwind typography 플러그인을
// 쓰지 않고 직접 매핑한다 — 사이트 톤 (gray-900 배경, amber accent) 과 prose
// 기본 광택이 안 맞고, 길이가 긴 docs 에서 폰트/여백을 정확히 컨트롤하기 위함.

// 외부 도메인으로 redirect 되는 path 들. Next <Link> 가 hover 시 RSC prefetch 를
// 보내면 redirect → discord.com preflight 가 콘솔에 CORS 에러로 박힌다. 같은
// 색/텍스트지만 plain <a target="_blank"> 로 렌더해 prefetch 를 막는다.
const REDIRECT_TO_EXTERNAL = new Set(['/invite'])

const components: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="text-2xl sm:text-3xl font-bold text-white mt-8 mb-4 pb-2 border-b border-gray-800">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl sm:text-2xl font-bold text-white mt-10 mb-3">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base sm:text-lg font-bold text-amber-300 mt-6 mb-2">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-bold text-gray-200 mt-4 mb-2 uppercase tracking-wider">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="text-gray-300 leading-relaxed my-3">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 text-gray-300 my-3 space-y-1">{children}</ul>,
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 text-gray-300 my-3 space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => {
    const isExternal = typeof href === 'string' && /^https?:\/\//.test(href)
    const redirectsExternal = typeof href === 'string' && REDIRECT_TO_EXTERNAL.has(href)
    if (isExternal || redirectsExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-300 underline underline-offset-2 hover:text-amber-200"
        >
          {children}
        </a>
      )
    }
    return (
      <Link
        href={href ?? '#'}
        className="text-amber-300 underline underline-offset-2 hover:text-amber-200"
      >
        {children}
      </Link>
    )
  },
  // 인라인 code: 파란 단색 배지. 블록 code (```...```) 는 pre 가 감싸므로 별도
  // 처리 — pre 안에서는 배경 없는 모노폰트로 두고 pre 가 스타일을 잡는다.
  code: ({ children }) => (
    <code className="bg-gray-800 text-amber-200 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 my-4 overflow-x-auto text-xs leading-relaxed font-mono text-gray-200">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-amber-500/50 bg-amber-500/5 px-4 py-2 my-4 text-gray-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-gray-800 my-8" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-800 bg-gray-900 px-3 py-2 text-left text-gray-200 font-bold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-800 px-3 py-2 text-gray-300">{children}</td>
  ),
  strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,
  em: ({ children }) => <em className="text-gray-200 italic">{children}</em>,
}

export function useMDXComponents(): MDXComponents {
  return components
}
