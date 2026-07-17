import type { ComponentType, HTMLAttributes, ReactNode } from 'react'

export type DesignTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

type IconComponent = ComponentType<{ size?: number; className?: string }>

interface ToneClasses {
  border: string
  background: string
  icon: string
  value: string
  label: string
}

const TONE_CLASSES: Record<DesignTone, ToneClasses> = {
  neutral: {
    border: 'border-border',
    background: 'bg-surface',
    icon: 'text-muted',
    value: 'text-foreground',
    label: 'text-subtle',
  },
  accent: {
    border: 'border-accent/30',
    background: 'bg-accent-soft',
    icon: 'text-accent-soft-foreground',
    value: 'text-accent-soft-foreground',
    label: 'text-accent-soft-foreground/80',
  },
  success: {
    border: 'border-success/30',
    background: 'bg-success-soft',
    icon: 'text-success-soft-foreground',
    value: 'text-success-soft-foreground',
    label: 'text-success-soft-foreground/80',
  },
  warning: {
    border: 'border-warning/30',
    background: 'bg-warning-soft',
    icon: 'text-warning-soft-foreground',
    value: 'text-warning-soft-foreground',
    label: 'text-warning-soft-foreground/80',
  },
  danger: {
    border: 'border-danger/30',
    background: 'bg-danger-soft',
    icon: 'text-danger-soft-foreground',
    value: 'text-danger-soft-foreground',
    label: 'text-danger-soft-foreground/80',
  },
  info: {
    border: 'border-info/30',
    background: 'bg-info-soft',
    icon: 'text-info-soft-foreground',
    value: 'text-info-soft-foreground',
    label: 'text-info-soft-foreground/80',
  },
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export const balancedHeadingClass = 'text-balance'
export const prettyTextClass = 'text-pretty'
export const pressScaleClass = 'active:not-disabled:scale-[0.96]'
export const pressableClass =
  `transition-transform duration-150 ease-out ${pressScaleClass}`
export const interactiveSurfaceClass =
  'transition-[border-color,background-color,box-shadow,transform,opacity] duration-200 ease-out'
export const mediaOutlineClass = 'outline outline-1 -outline-offset-1 outline-white/10'

export function getDesignToneClasses(tone: DesignTone = 'neutral'): ToneClasses {
  return TONE_CLASSES[tone]
}

interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
}

/**
 * Product-level page heading. Keep the primary decision and its action in a
 * single horizontal band so the first viewport has an obvious reading order:
 * context → title → explanation → action.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cx('flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between', className)}
      {...props}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-soft-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className={cx('mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl', balancedHeadingClass)}>
          {title}
        </h1>
        {description && (
          <p className={cx('mt-2 text-sm leading-relaxed text-muted sm:text-base', prettyTextClass)}>
            {description}
          </p>
        )}
        {meta && <div className="mt-3">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

interface SectionCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  icon?: IconComponent
  tone?: DesignTone
  headerRight?: ReactNode
  children?: ReactNode
}

export function SectionCard({
  eyebrow,
  title,
  description,
  icon: Icon,
  tone = 'neutral',
  headerRight,
  children,
  className,
  ...props
}: SectionCardProps) {
  const toneClasses = getDesignToneClasses(tone)
  const hasHeader = eyebrow || title || description || Icon || headerRight

  return (
    <div
      className={cx(
        'rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5',
        interactiveSurfaceClass,
        className,
      )}
      {...props}
    >
      {hasHeader && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {(eyebrow || Icon) && (
              <div className={cx('flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]', toneClasses.label)}>
                {Icon && <Icon size={15} className={toneClasses.icon} aria-hidden="true" />}
                {eyebrow}
              </div>
            )}
            {title && (
              <h2 className={cx('mt-1 text-lg font-semibold text-foreground', balancedHeadingClass)}>
                {title}
              </h2>
            )}
            {description && (
              <p className={cx('mt-1 max-w-3xl text-sm leading-relaxed text-muted', prettyTextClass)}>
                {description}
              </p>
            )}
          </div>
          {headerRight}
        </div>
      )}
      {children}
    </div>
  )
}

interface ValueDisplayProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  detail?: ReactNode
  icon?: IconComponent
  iconNode?: ReactNode
  tone?: DesignTone
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'center'
  labelClassName?: string
  valueClassName?: string
  detailClassName?: string
  iconClassName?: string
  iconShellClassName?: string
}

const VALUE_SIZE_CLASSES = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-3xl sm:text-4xl',
} as const

export function ValueDisplay({
  label,
  value,
  unit,
  detail,
  icon: Icon,
  iconNode,
  tone = 'neutral',
  size = 'md',
  align = 'left',
  labelClassName,
  valueClassName,
  detailClassName,
  iconClassName,
  iconShellClassName,
  className,
  ...props
}: ValueDisplayProps) {
  const toneClasses = getDesignToneClasses(tone)

  return (
    <div className={cx(align === 'center' && 'text-center', className)} {...props}>
      <div
        className={cx(
          'flex items-center gap-2',
          align === 'center' && 'justify-center',
          toneClasses.label,
        )}
      >
        {(Icon || iconNode) && (
          <span
            className={cx(
              'flex h-7 w-7 items-center justify-center rounded-lg border',
              toneClasses.border,
              toneClasses.background,
              iconShellClassName,
            )}
          >
            {Icon ? (
              <Icon size={15} className={cx(toneClasses.icon, iconClassName)} aria-hidden="true" />
            ) : (
              <span className={cx(toneClasses.icon, iconClassName)} aria-hidden="true">
                {iconNode}
              </span>
            )}
          </span>
        )}
        <span className={cx('text-[11px] font-semibold uppercase tracking-[0.14em]', labelClassName)}>
          {label}
        </span>
      </div>
      <div
        className={cx(
          'mt-2 font-mono font-black leading-none tabular-nums',
          VALUE_SIZE_CLASSES[size],
          toneClasses.value,
          valueClassName,
        )}
      >
        {value}
        {unit && (
          <span className="ml-1 align-baseline text-[0.55em] font-semibold tracking-normal">
            {unit}
          </span>
        )}
      </div>
      {detail && (
        <p className={cx('mt-2 text-xs leading-relaxed text-muted', prettyTextClass, detailClassName)}>
          {detail}
        </p>
      )}
    </div>
  )
}

interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: IconComponent
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  tone?: DesignTone
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
  ...props
}: EmptyStateProps) {
  const toneClasses = getDesignToneClasses(tone)

  return (
    <div
      className={cx(
        'rounded-lg border px-3 py-3',
        toneClasses.border,
        toneClasses.background,
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-3">
        {Icon && <Icon size={18} className={cx('mt-0.5 flex-shrink-0', toneClasses.icon)} />}
        <div className="min-w-0">
          <p className={cx('text-sm font-semibold', balancedHeadingClass, toneClasses.value)}>{title}</p>
          {description && (
            <p className={cx('mt-1 text-xs leading-relaxed text-muted', prettyTextClass)}>
              {description}
            </p>
          )}
          {action && <div className="mt-2">{action}</div>}
        </div>
      </div>
    </div>
  )
}

interface ListSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function ListSurface({ className, children, ...props }: ListSurfaceProps) {
  return (
    <div
      className={cx('overflow-hidden rounded-[var(--radius-panel,0.75rem)] bg-surface shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  )
}

interface ListRowProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
  interactive?: boolean
}

export function ListRow({ className, children, interactive = false, ...props }: ListRowProps) {
  return (
    <div
      className={cx(
        'border-b border-border px-4 py-3 last:border-b-0',
        interactive && 'transition-[background-color,transform] duration-150 ease-out hover:bg-surface-2 active:scale-[0.99]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export interface MetricStripItem {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  tone?: DesignTone
}

interface MetricStripProps extends HTMLAttributes<HTMLDListElement> {
  items: ReadonlyArray<MetricStripItem>
}

export function MetricStrip({ items, className, ...props }: MetricStripProps) {
  return (
    <dl
      className={cx(
        'grid overflow-hidden rounded-[var(--radius-panel,0.75rem)] bg-surface shadow-card sm:grid-flow-col sm:auto-cols-fr',
        className,
      )}
      {...props}
    >
      {items.map((item, index) => {
        const tone = getDesignToneClasses(item.tone)
        return (
          <div
            key={index}
            className="border-b border-border px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <dt className={cx('text-[11px] font-semibold uppercase tracking-[0.12em]', tone.label)}>
              {item.label}
            </dt>
            <dd className={cx('mt-1 font-mono text-xl font-bold tabular-nums', tone.value)}>
              {item.value}
            </dd>
            {item.detail && <p className="mt-1 text-xs text-muted">{item.detail}</p>}
          </div>
        )
      })}
    </dl>
  )
}

interface StickyActionBarProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function StickyActionBar({ className, children, ...props }: StickyActionBarProps) {
  return (
    <div
      className={cx(
        'sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 rounded-[var(--radius-panel,0.75rem)] bg-surface/95 p-3 shadow-pop backdrop-blur-md lg:bottom-4',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface FulfillmentStripProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  detail?: ReactNode
  action?: ReactNode
  icon?: IconComponent
  tone?: DesignTone
}

export function FulfillmentStrip({
  title,
  detail,
  action,
  icon: Icon,
  tone = 'neutral',
  className,
  ...props
}: FulfillmentStripProps) {
  const toneClasses = getDesignToneClasses(tone)
  return (
    <div
      className={cx('flex items-center gap-3 border-l-2 px-3 py-2.5', toneClasses.border, toneClasses.background, className)}
      {...props}
    >
      {Icon && <Icon size={17} className={cx('shrink-0', toneClasses.icon)} aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className={cx('text-sm font-semibold', toneClasses.value)}>{title}</p>
        {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
      </div>
      {action}
    </div>
  )
}

type ErrorStateProps = Omit<EmptyStateProps, 'tone'>

export function ErrorState(props: ErrorStateProps) {
  return <EmptyState tone="danger" {...props} />
}

interface SkeletonRowsProps extends HTMLAttributes<HTMLDivElement> {
  count?: number
}

export function SkeletonRows({ count = 4, className, ...props }: SkeletonRowsProps) {
  return (
    <div className={cx('overflow-hidden rounded-[var(--radius-panel,0.75rem)] bg-surface shadow-card', className)} {...props}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
          <div className="h-9 w-9 shrink-0 rounded-[var(--radius-control,0.5rem)] bg-surface-3" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-surface-3" />
            <div className="h-2.5 w-3/5 rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

type OperationSurfaceKind =
  | 'situation'
  | 'sequence'
  | 'board'
  | 'queue'
  | 'ledger'
  | 'workbench'

interface OperationSurfaceProps extends HTMLAttributes<HTMLElement> {
  kind: OperationSurfaceKind
  children?: ReactNode
  label?: ReactNode
}

const OPERATION_SURFACE_CLASSES: Record<OperationSurfaceKind, string> = {
  situation:
    'border-y border-border bg-surface/72 px-4 py-4 shadow-[inset_3px_0_0_var(--operation-surface-marker,var(--color-accent))] sm:px-5',
  sequence:
    'border-l-2 border-[var(--operation-surface-marker,var(--color-info))] bg-surface/48 pl-4 pr-3 py-4 sm:pl-5 sm:pr-5',
  board:
    'overflow-hidden border border-border bg-[linear-gradient(hsl(220_14%_96%/0.018)_1px,transparent_1px),linear-gradient(90deg,hsl(220_14%_96%/0.018)_1px,transparent_1px),var(--color-surface)] bg-[size:1.5rem_1.5rem] shadow-card',
  queue:
    'overflow-hidden border-y border-border bg-surface shadow-[inset_3px_0_0_var(--operation-surface-marker,var(--color-warning))]',
  ledger:
    'overflow-hidden border-y border-border bg-surface/82 font-[var(--font-system-sans)] [font-variant-numeric:tabular-nums]',
  workbench:
    'overflow-hidden border border-border bg-surface/88 shadow-[0_18px_48px_-30px_rgba(0,0,0,0.75)]',
}

/**
 * Six semantic surfaces encode how information is used. This prevents every
 * object from collapsing into the same floating card while keeping one shared
 * accessibility and spacing contract.
 */
export function OperationSurface({
  kind,
  label,
  children,
  className,
  ...props
}: OperationSurfaceProps) {
  return (
    <section
      data-operation-surface={kind}
      aria-label={typeof label === 'string' ? label : undefined}
      className={cx(OPERATION_SURFACE_CLASSES[kind], className)}
      {...props}
    >
      {label && typeof label !== 'string' && (
        <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-subtle">
          {label}
        </div>
      )}
      {children}
    </section>
  )
}

type NamedOperationSurfaceProps = Omit<OperationSurfaceProps, 'kind'>

export function SituationSurface(props: NamedOperationSurfaceProps) {
  return <OperationSurface kind="situation" {...props} />
}

export function SequenceSurface(props: NamedOperationSurfaceProps) {
  return <OperationSurface kind="sequence" {...props} />
}

export function BoardSurface(props: NamedOperationSurfaceProps) {
  return <OperationSurface kind="board" {...props} />
}

export function QueueSurface(props: NamedOperationSurfaceProps) {
  return <OperationSurface kind="queue" {...props} />
}

export function LedgerSurface(props: NamedOperationSurfaceProps) {
  return <OperationSurface kind="ledger" {...props} />
}

export function WorkbenchSurface(props: NamedOperationSurfaceProps) {
  return <OperationSurface kind="workbench" {...props} />
}
