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

export function getDesignToneClasses(tone: DesignTone = 'neutral'): ToneClasses {
  return TONE_CLASSES[tone]
}

interface SectionCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  icon?: IconComponent
  tone?: DesignTone
  headerRight?: ReactNode
  children: ReactNode
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
            {title && <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>}
            {description && (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{description}</p>
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
  tone?: DesignTone
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'center'
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
  tone = 'neutral',
  size = 'md',
  align = 'left',
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
        {Icon && (
          <span
            className={cx(
              'flex h-7 w-7 items-center justify-center rounded-lg border',
              toneClasses.border,
              toneClasses.background,
            )}
          >
            <Icon size={15} className={toneClasses.icon} aria-hidden="true" />
          </span>
        )}
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div
        className={cx(
          'mt-2 font-mono font-black leading-none tabular-nums',
          VALUE_SIZE_CLASSES[size],
          toneClasses.value,
        )}
      >
        {value}
        {unit && (
          <span className="ml-1 align-baseline text-[0.55em] font-semibold tracking-normal">
            {unit}
          </span>
        )}
      </div>
      {detail && <p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p>}
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
          <p className={cx('text-sm font-semibold', toneClasses.value)}>{title}</p>
          {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
          {action && <div className="mt-2">{action}</div>}
        </div>
      </div>
    </div>
  )
}
