import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { fetchArtifactCatalog } from '@/api/graph'
import TopNav from '@/components/TopNav'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'
import type { AppRoute } from '@/lib/routes'

interface LearningPlansIndexPageProps {
  userId: string
  onNavigate: (route: AppRoute) => void
}

function formatCreatedAt(value?: string | null) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()
}

export default function LearningPlansIndexPage({ userId, onNavigate }: LearningPlansIndexPageProps) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchArtifactCatalog>>['items']>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    void fetchArtifactCatalog('learning_plan', userId)
      .then((response) => setItems(response.items))
      .catch((error) => toast.error(getErrorMessage(error, 'Failed to load saved learning plans.')))
      .finally(() => setIsLoading(false))
  }, [userId])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav active="learning" onNavigate={onNavigate} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Saved Learning Plans</p>
          <h1 className="mt-2 text-3xl font-semibold">Your study plans</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Reopen any saved paper or topic learning plan here. Each item opens the latest persisted version for that subject.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full flex items-center gap-3 rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading saved learning plans…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-border bg-card/60 p-6 text-sm text-muted-foreground backdrop-blur-xl">
              You haven’t generated any learning plans yet. Start from the graph or search bar, then come back here to revisit them.
            </div>
          ) : (
            items.map((item) => (
              <div key={`${item.subject_type}-${item.subject_id}`} className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">
                  {item.subject_type === 'paper' ? 'Paper Plan' : 'Topic Plan'}
                </p>
                <h2 className="mt-2 text-lg font-semibold">{item.title || item.subject_id}</h2>
                <p className="mt-2 text-sm text-muted-foreground">Saved {formatCreatedAt(item.created_at)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.provider} • {item.model}</p>
                <div className="mt-4">
                  <Button
                    onClick={() =>
                      onNavigate({
                        kind: 'learning-plan',
                        subjectType: item.subject_type as 'paper' | 'topic',
                        subjectId: item.subject_id,
                        title: item.title ?? undefined,
                      })
                    }
                  >
                    Open plan
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
