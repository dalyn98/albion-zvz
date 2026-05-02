'use client'

// 공개 길드 프로필 (`/g/<slug>`) 의 인라인 편집 래퍼. 어드민이 자신의 길드
// 페이지를 볼 때만 활성화되어 (enabled prop), 호버 시 ✏️ 핀이 뜬다. 클릭 →
// 인라인 폼이 열려 값을 편집/저장하면 `router.refresh()` 로 RSC 가 다시 돌아
// 화면이 갱신된다.
//
// 별도 admin 폼을 만들지 않고 페이지 자체를 편집 UI 로 쓰는 것이 사용자 의도
// — 직관성을 위해 표시되는 곳에서 직접 고친다.

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Pencil, Check, X, Plus, Loader2 } from 'lucide-react'
import type { AppSettingKey } from '@/lib/app-settings'
import { updateAppSetting } from '@/app/actions/settings'

export type EditorKind = 'text' | 'textarea' | 'select' | 'csv'

export interface EditorOption {
  value: string
  label: string
}

interface Props {
  // 어드민 + viewingOwnGuild 일 때만 true. false 면 편집 UI 자체가 렌더되지 않아
  // 일반 방문자에겐 추가 비용 0.
  enabled: boolean
  settingKey: AppSettingKey
  // 현재 저장값. 편집 폼 초기값 + 빈 값 판단에 사용.
  currentValue: string
  kind: EditorKind
  // select / csv 일 때 옵션 배열.
  options?: EditorOption[]
  // 빈 값일 때 어드민에게 보여줄 안내 ("모집 포지션 추가" 등). 누르면 편집 모드.
  emptyLabel?: string
  // 편집 폼 헤더 라벨 ("모집 포지션").
  label: string
  placeholder?: string
  maxLength?: number
  // 표시 자체 — 빈 값이 아닐 때만 그려진다 (children 이 falsy 면 emptyLabel fallback).
  children: ReactNode
  // 'block' = 풀 너비 (description, info card, event schedule). 'inline' = 콘텐츠
  // 너비만 차지 (hero chip, recruitment 배지처럼 flex 안에 여러 개 줄지어 놓는 경우).
  // 기본 'block' — 카드/섹션 단위 편집이 다수.
  display?: 'block' | 'inline'
}

export default function InlineEditableField({
  enabled,
  settingKey,
  currentValue,
  kind,
  options,
  emptyLabel,
  label,
  placeholder,
  maxLength,
  children,
  display = 'block',
}: Props) {
  const router = useRouter()
  const tCommon = useTranslations('common')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(currentValue)
  const [csvSelected, setCsvSelected] = useState<string[]>(() => parseCsv(currentValue))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!enabled) {
    // 비-편집 모드 — 어드민이 아닐 때는 children 그대로. 빈 값 처리는 부모가 결정.
    return <>{children}</>
  }

  const isEmpty = currentValue.trim().length === 0

  const onSave = () => {
    const value = kind === 'csv' ? csvSelected.join(',') : draft
    setError(null)
    startTransition(async () => {
      const res = await updateAppSetting(settingKey, value)
      if (res.error) {
        setError(res.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  const onCancel = () => {
    setDraft(currentValue)
    setCsvSelected(parseCsv(currentValue))
    setError(null)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-amber-500/50 bg-gray-900/80 p-3 backdrop-blur-sm space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-amber-300">
            {label}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
              aria-label={tCommon('cancel')}
            >
              <X size={14} />
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isPending}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-amber-300 hover:text-amber-200 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
              aria-label={tCommon('save')}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
          </div>
        </div>
        <Editor
          kind={kind}
          draft={draft}
          setDraft={setDraft}
          csvSelected={csvSelected}
          setCsvSelected={setCsvSelected}
          options={options}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={isPending}
        />
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </div>
    )
  }

  // 비편집 + 어드민. emptyLabel 이 주어지고 값이 비어 있으면 "+ 추가" 버튼.
  // emptyLabel 이 없으면 (server/recruitment 처럼 fallback 으로 늘 표시되는 케이스)
  // children + 호버 시 ✏️ 만 보여준다.
  if (isEmpty && emptyLabel) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-gray-400 hover:text-amber-200 ring-1 ring-gray-700 hover:ring-amber-500/40 bg-gray-900/40 transition-colors"
      >
        <Plus size={11} />
        <span>{emptyLabel}</span>
      </button>
    )
  }

  const wrapperClass =
    display === 'inline'
      ? 'group relative inline-block'
      : 'group relative block w-full'
  return (
    <div className={wrapperClass}>
      {children}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="absolute top-0 right-0 -translate-y-2 translate-x-2 inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-900/90 text-amber-300 ring-1 ring-amber-500/40 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        aria-label={`${label} ${tCommon('edit')}`}
      >
        <Pencil size={12} />
      </button>
    </div>
  )
}

interface EditorProps {
  kind: EditorKind
  draft: string
  setDraft: (v: string) => void
  csvSelected: string[]
  setCsvSelected: (v: string[]) => void
  options?: EditorOption[]
  placeholder?: string
  maxLength?: number
  disabled: boolean
}

function Editor({
  kind,
  draft,
  setDraft,
  csvSelected,
  setCsvSelected,
  options,
  placeholder,
  maxLength,
  disabled,
}: EditorProps) {
  if (kind === 'text') {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength ?? 100}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-md bg-gray-950/60 text-sm text-white border border-gray-800 focus:border-amber-500/60 focus:outline-none placeholder-gray-600"
      />
    )
  }
  if (kind === 'textarea') {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength ?? 500}
        disabled={disabled}
        rows={4}
        className="w-full px-3 py-2 rounded-md bg-gray-950/60 text-sm text-white border border-gray-800 focus:border-amber-500/60 focus:outline-none placeholder-gray-600 resize-y"
      />
    )
  }
  if (kind === 'select') {
    const opts = options ?? []
    return (
      <select
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-md bg-gray-950/60 text-sm text-white border border-gray-800 focus:border-amber-500/60 focus:outline-none"
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  // csv (multi-select via checkbox grid). 토글로 켜고 끔.
  const opts = options ?? []
  const toggle = (value: string) => {
    if (csvSelected.includes(value)) {
      setCsvSelected(csvSelected.filter((v) => v !== value))
    } else {
      setCsvSelected([...csvSelected, value])
    }
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => {
        const active = csvSelected.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            disabled={disabled}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 transition-colors ${
              active
                ? 'bg-amber-500/20 text-amber-200 ring-amber-500/50'
                : 'bg-gray-900/60 text-gray-400 ring-gray-800 hover:text-gray-200 hover:ring-gray-700'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function parseCsv(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
