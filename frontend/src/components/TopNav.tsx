import { BookOpen, Compass, Sparkles, UserRoundSearch } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { AppRoute } from '@/lib/routes'

interface TopNavProps {
  active: 'graph' | 'learning' | 'future' | 'professors'
  onNavigate: (route: AppRoute) => void
}

export default function TopNav({ active, onNavigate }: TopNavProps) {
  const items: Array<{
    key: TopNavProps['active']
    label: string
    route: AppRoute
    icon: typeof Compass
  }> = [
    { key: 'graph', label: 'Graph', route: { kind: 'home' }, icon: Compass },
    { key: 'learning', label: 'Learning Plans', route: { kind: 'learning-plans' }, icon: BookOpen },
    { key: 'future', label: 'Further Reading', route: { kind: 'future-potential-home' }, icon: Sparkles },
    { key: 'professors', label: 'Professor Analysis', route: { kind: 'professors-home' }, icon: UserRoundSearch },
  ]

  return (
    <div className="border-b border-border bg-card/70 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Button
              key={item.key}
              variant={active === item.key ? 'default' : 'outline'}
              className={active === item.key ? '' : 'border-border bg-background/35'}
              onClick={() => onNavigate(item.route)}
            >
              <Icon data-icon="inline-start" />
              {item.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
