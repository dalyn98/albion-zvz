'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  isActive?: boolean
}

interface Props {
  items: NavItem[]
  openLabel: string
  closeLabel: string
}

// 모바일/태블릿(<md) 마케팅 네비의 햄버거 메뉴. 데스크탑에서는 md:hidden 으로 가려지고
// 본 nav 의 가로 링크 묶음이 그대로 노출된다. ESC / 백드롭 / 링크 클릭으로 닫힘.
//
// 부모 nav 가 `backdrop-blur-md` 를 쓰면 fixed 자식의 containing block 이 nav 로
// 축소되어 백드롭이 nav 영역(≈56px) 만 덮는 회귀가 있었다. createPortal 로
// document.body 로 빼내 viewport 전체를 회복.
export default function MarketingNavMobileMenu({ items, openLabel, closeLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // SSR hydration 직후 mount 플래그 — portal 렌더 가드.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  const drawer =
    open && mounted
      ? createPortal(
          <div
	            className="fixed inset-0 z-[80] md:hidden"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute top-0 left-0 right-0 bg-[#0b0d12] border-b border-white/10 shadow-xl">
              <div className="flex items-center justify-end px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={closeLabel}
                  title={closeLabel}
                  className="inline-flex items-center justify-center text-gray-300 hover:text-white bg-gray-800/60 hover:bg-gray-800 border border-gray-700 rounded-md w-9 h-9 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <ul className="px-3 pb-3 space-y-1">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`block px-4 py-3 rounded-lg text-base transition-colors ${
                        item.isActive
                          ? 'bg-amber-500/15 text-amber-200 font-semibold'
                          : 'text-gray-200 hover:bg-gray-800/60'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={openLabel}
        title={openLabel}
	        className="inline-flex items-center justify-center text-gray-300 hover:text-white bg-gray-800/60 hover:bg-gray-800 border border-gray-700 rounded-md w-9 h-9 transition-colors md:hidden"
      >
        <Menu size={16} />
      </button>
      {drawer}
    </>
  )
}
