import Link from 'next/link'
import { ShoppingBag, Store, Wallet } from 'lucide-react'

type MemberEconomySection = 'wallet' | 'shop' | 'market'

interface Props {
  active: MemberEconomySection
  ariaLabel: string
  labels: Record<MemberEconomySection, string>
  available: Record<MemberEconomySection, boolean>
}

const ITEMS = [
  { key: 'wallet', href: '/me/wallet', icon: Wallet },
  { key: 'shop', href: '/shop', icon: ShoppingBag },
  { key: 'market', href: '/market', icon: Store },
] as const

export default function MemberEconomyNav({ active, ariaLabel, labels, available }: Props) {
  const visibleItems = ITEMS.filter(({ key }) => key === active || available[key])

  return (
    <nav aria-label={ariaLabel} className="overflow-x-auto border-b border-border">
      <div className="flex min-w-max gap-1">
        {visibleItems.map(({ key, href, icon: Icon }) => {
          const isActive = active === key
          return (
            <Link
              key={key}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-accent text-accent-soft-foreground'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {labels[key]}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
