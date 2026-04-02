import type { ReactNode } from 'react'
import { ArrowLeft, History, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AppRoute } from '@/lib/routes'
import type { GeneratedArtifactHistoryItem } from '@/types/graph'
import TopNav from '@/components/TopNav'

interface ArtifactNavItem {
  label: string
  route: AppRoute
  active?: boolean
}

interface ArtifactPageLayoutProps {
  activeNav: 'graph' | 'learning' | 'future' | 'professors'
  eyebrow: string
  title: string
  subtitle: string
  provider?: string | null
  createdAt?: string | null
  navItems?: ArtifactNavItem[]
  onNavigate: (route: AppRoute) => void
  onBackHome: () => void
  onRefresh: () => void
  isRefreshing?: boolean
  history: GeneratedArtifactHistoryItem[]
  onSelectHistory: (artifactId: number) => void
  activeArtifactId?: number | null
  children: ReactNode
}

function formatCreatedAt(value?: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

export default function ArtifactPageLayout({
  activeNav,
  eyebrow,
  title,
  subtitle,
  provider,
  createdAt,
  navItems = [],
  onNavigate,
  onBackHome,
  onRefresh,
  isRefreshing = false,
  history,
  onSelectHistory,
  activeArtifactId,
  children,
}: ArtifactPageLayoutProps) {
  const formattedCreatedAt = formatCreatedAt(createdAt)

  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(245,158,11,0.16),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(96,165,250,0.18),transparent_26%),radial-gradient(circle_at_54%_78%,rgba(52,211,153,0.12),transparent_24%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />

      <div className="relative flex h-full min-h-0 flex-col">
        <TopNav active={activeNav} onNavigate={onNavigate} />
        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-h-0 flex-col">
          <div className="border-b border-border bg-card/70 px-5 py-4 backdrop-blur-xl sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">{eyebrow}</p>
                <h1 className="mt-2 max-w-4xl text-2xl font-semibold leading-tight text-foreground">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="border-border bg-background/35" onClick={onBackHome}>
                  <ArrowLeft data-icon="inline-start" />
                  Back to graph
                </Button>
                <Button onClick={onRefresh} disabled={isRefreshing}>
                  <Sparkles data-icon="inline-start" />
                  {isRefreshing ? 'Refreshing…' : 'Regenerate'}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {provider ? (
                <Badge variant="outline" className="border-primary/25 bg-primary/10">
                  {provider}
                </Badge>
              ) : null}
              {formattedCreatedAt ? (
                <Badge variant="outline">Saved {formattedCreatedAt}</Badge>
              ) : null}
              {navItems.map((item) => (
                <Button
                  key={item.label}
                  variant={item.active ? 'default' : 'outline'}
                  className={item.active ? '' : 'border-border bg-background/35'}
                  onClick={() => onNavigate(item.route)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">{children}</div>
          </ScrollArea>
        </div>

        <aside className="hidden min-h-0 border-l border-border bg-card/60 backdrop-blur-xl xl:flex xl:flex-col">
          <div className="border-b border-border px-4 py-4">
            <div className="flex items-center gap-2 text-foreground">
              <History className="h-4 w-4 text-primary" />
              <span className="font-medium">History</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Reopen prior generated versions without creating a new run.
            </p>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-2 p-4">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved runs yet.</p>
              ) : (
                history.map((item) => {
                  const isActive = activeArtifactId === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectHistory(item.id)}
                      className={`rounded-2xl border px-3 py-3 text-left transition ${
                        isActive
                          ? 'border-primary/40 bg-primary/10 text-foreground'
                          : 'border-border bg-background/35 hover:bg-accent'
                      }`}
                    >
                      <p className="text-sm font-medium">Run #{item.id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatCreatedAt(item.created_at) ?? 'Unknown time'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.provider} • {item.model}
                      </p>
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </aside>
        </div>
      </div>
    </div>
  )
}
