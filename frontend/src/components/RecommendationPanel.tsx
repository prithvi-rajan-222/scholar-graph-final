import { Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { RecommendationResponse } from '@/types/graph'

interface RecommendationPanelProps {
  data: RecommendationResponse | null
  isLoading: boolean
  onSelectPaper: (paperId: string, title?: string | null) => void
}

export default function RecommendationPanel({ data, isLoading, onSelectPaper }: RecommendationPanelProps) {
  return (
    <div className="rounded-3xl border border-border bg-card/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Reading Copilot</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">What to read next</h2>
        </div>
        {data ? (
          <Badge variant="outline" className="border-primary/25 bg-primary/10">
            {data.provider}
          </Badge>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Finding next papers from your graph context…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pick a topic to generate graph-backed recommendations.</p>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <button
              key={item.paper.id}
              type="button"
              onClick={() => onSelectPaper(item.paper.id, item.paper.title)}
              className="w-full rounded-2xl border border-border bg-background/35 p-3 text-left transition hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.paper.title || item.paper.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.paper.year ? `${item.paper.year} • ` : ''}
                    {(item.paper.citationCount ?? 0).toLocaleString()} citations
                  </p>
                </div>
                <Sparkles className="mt-1 h-4 w-4 shrink-0 text-primary" />
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground/80">{item.reason}</p>
              {item.evidence.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.evidence.map((evidence) => (
                    <Badge key={`${item.paper.id}-${evidence.paper_id}`} variant="outline" className="text-[10px]">
                      {evidence.relation}: {evidence.paper_id}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
