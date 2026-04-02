import { useState } from 'react'
import { BookMarked, BookOpen, ChevronRight, FileText, PanelRightClose, X } from 'lucide-react'
import { usePaperDetail } from '@/hooks/useGraph'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Paper, PaperStatus } from '@/types/graph'

interface DetailPanelProps {
  paperId: string | null
  userId: string
  onLearnThis: (paperId: string) => void
  onClose: () => void
  isRead: (id: string) => boolean
  isUnlocked: (id: string) => boolean
  onToggleRead: (id: string) => void
  getStatus: (id: string) => PaperStatus | undefined
  onSetStatus: (id: string, status: PaperStatus) => void
  onSelectPaper: (paper: Paper) => void
}

export default function DetailPanel({
  paperId,
  userId,
  onLearnThis,
  onClose,
  isRead,
  isUnlocked,
  onToggleRead,
  getStatus,
  onSetStatus,
  onSelectPaper,
}: DetailPanelProps) {
  const [abstractExpanded, setAbstractExpanded] = useState(false)
  const { data, isLoading } = usePaperDetail(paperId)

  if (!paperId) {
    return (
      <aside className="flex h-full flex-col border-l border-border bg-card/60 backdrop-blur-xl">
        <div className="border-b border-border p-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <PanelRightClose className="h-3.5 w-3.5" />
            Sidebar
          </div>
          <h2 className="text-base font-semibold text-foreground">Paper details</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Click a paper node to inspect the abstract, topics, prerequisites, and actions.
          </p>
        </div>
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          No paper selected.
        </div>
      </aside>
    )
  }

  const title = data?.title
  const year = data?.year
  const citationCount = data?.citationCount
  const abstract = data?.abstract
  const authors = data?.authors ?? []
  const topics = data?.topics ?? []
  const prerequisites = data?.prerequisites ?? []
  const followUps = data?.cited_by ?? []
  const paperIsRead = isRead(paperId)
  const paperIsUnlocked = !paperIsRead && isUnlocked(paperId)
  const currentStatus = getStatus(paperId) ?? data?.status ?? 'to_read'

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-card/70 backdrop-blur-xl">
      <div className="shrink-0 border-b border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)] p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="rounded-full border border-border bg-background/40 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Paper Detail
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-border bg-background/40 p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex-1 text-left text-base font-semibold leading-snug text-foreground">
            {isLoading ? <Skeleton className="h-5 w-full" /> : (title ?? 'Loading…')}
          </h2>
        </div>
        {isLoading ? (
          <Skeleton className="mt-3 h-4 w-32" />
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {year && <span className="text-xs text-muted-foreground">{year}</span>}
            {citationCount != null && (
              <Badge variant="secondary" className="border border-primary/10 bg-primary/15 text-xs text-primary-foreground">
                {citationCount.toLocaleString()} citations
              </Badge>
            )}
            <Badge
              variant="outline"
              className={
                paperIsRead
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : paperIsUnlocked
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
              }
            >
              {paperIsRead ? 'Read' : paperIsUnlocked ? 'Unlocked' : 'Unread'}
            </Badge>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-4 pb-4">
          {isLoading ? (
            <Skeleton className="h-20 w-full rounded-2xl" />
          ) : authors.length > 0 ? (
            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <p className="mb-1 text-xs text-muted-foreground">Authors</p>
              <p className="text-sm leading-6">{authors.map((a) => a.name).join(', ')}</p>
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ) : abstract ? (
            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Abstract</p>
              </div>
              <p className={`text-sm leading-7 text-foreground/80 ${abstractExpanded ? '' : 'line-clamp-5'}`}>
                {abstract}
              </p>
              {abstract.length > 200 && (
                <button
                  onClick={() => setAbstractExpanded((v) => !v)}
                  className="mt-2 text-xs text-primary transition hover:text-primary/80"
                >
                  {abstractExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          ) : null}

          {topics.length > 0 && (
            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <p className="mb-2 text-xs text-muted-foreground">Topics</p>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <Badge key={t.id || t.name} variant="outline" className="border-border bg-background/40 text-xs text-foreground">
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {prerequisites.length > 0 && (
            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <p className="mb-2 text-xs text-muted-foreground">Prerequisites</p>
              <ul className="flex flex-col gap-2">
                {prerequisites.map((p) => (
                  <li key={p.id}>
                    <button
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-background/35 px-3 py-2 text-left text-sm text-foreground transition hover:border-primary/30 hover:bg-accent hover:text-foreground"
                      onClick={() => onSelectPaper(p)}
                    >
                      <span className="line-clamp-2 pr-3">{p.title}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {followUps.length > 0 && (
            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <p className="mb-2 text-xs text-muted-foreground">Builds on this paper</p>
              <ul className="flex flex-col gap-2">
                {followUps.map((p) => (
                  <li key={p.id}>
                    <button
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-background/35 px-3 py-2 text-left text-sm text-foreground transition hover:border-primary/30 hover:bg-accent hover:text-foreground"
                      onClick={() => onSelectPaper(p)}
                    >
                      <span className="line-clamp-2 pr-3">{p.title}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background/30 p-5">
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => onLearnThis(paperId)}
            disabled={isLoading}
          >
            <BookOpen data-icon="inline-start" />
            Learn this
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-border bg-background/35"
            onClick={() => onToggleRead(paperId)}
            disabled={isLoading}
            title={`Toggle read state for ${userId}`}
          >
            <BookMarked data-icon="inline-start" />
            {paperIsRead ? 'Unmark' : 'Mark read'}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['to_read', 'reading', 'read', 'skipped'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onSetStatus(paperId, status)}
              className={`rounded-xl border px-3 py-2 text-xs capitalize transition ${
                currentStatus === status
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border bg-background/30 text-muted-foreground hover:bg-accent'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
