import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Loader2, Network, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { fetchArtifactHistory, fetchRecommendations } from '@/api/graph'
import ArtifactPageLayout from '@/components/ArtifactPageLayout'
import GraphCanvas from '@/components/GraphCanvas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'
import type { AppRoute } from '@/lib/routes'
import type { GraphData, GraphNode, RecommendationResponse } from '@/types/graph'

interface FuturePotentialPageProps {
  topic?: string
  userId: string
  onNavigate: (route: AppRoute) => void
  onBackHome: () => void
}

export default function FuturePotentialPage({
  topic,
  userId,
  onNavigate,
  onBackHome,
}: FuturePotentialPageProps) {
  const [data, setData] = useState<RecommendationResponse | null>(null)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof fetchArtifactHistory>>['items']>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const subjectType = topic ? 'topic' : 'user'
  const subjectId = topic ?? userId

  const load = async (options?: { refresh?: boolean; artifactId?: number }) => {
    const [recommendations, nextHistory] = await Promise.all([
      fetchRecommendations(topic, userId, { refresh: options?.refresh, artifactId: options?.artifactId }),
      fetchArtifactHistory('future_potential', subjectType, subjectId, userId),
    ])
    setData(recommendations)
    setHistory(nextHistory.items)
  }

  useEffect(() => {
    setIsLoading(true)
    void load()
      .catch((error) => toast.error(getErrorMessage(error, 'Failed to load future research potential.')))
      .finally(() => setIsLoading(false))
  }, [topic, userId, subjectId, subjectType])

  const connectionGraph = useMemo<GraphData>(() => {
    if (!data) return { nodes: [], links: [] }

    const nodeMap = new Map<string, GraphNode>()
    const links: GraphData['links'] = []

    for (const item of data.items) {
      nodeMap.set(item.paper.id, {
        id: item.paper.id,
        label: item.paper.title ?? item.paper.id,
        type: 'Paper',
        val: Math.max(item.paper.citationCount ?? 1, 1),
        citationCount: item.paper.citationCount,
        year: item.paper.year,
      })

      for (const evidence of item.evidence) {
        if (evidence.relation !== 'cites_read_paper') continue
        if (!nodeMap.has(evidence.paper_id)) {
          nodeMap.set(evidence.paper_id, {
            id: evidence.paper_id,
            label: evidence.note ?? evidence.paper_id,
            type: 'Paper',
            val: 1,
            read: true,
          })
        }
        links.push({
          source: evidence.paper_id,
          target: item.paper.id,
          type: 'CITED_BY',
        })
      }
    }

    return {
      nodes: [...nodeMap.values()],
      links,
    }
  }, [data])

  const navItems = useMemo(
    () =>
      topic
        ? [
            { label: 'Learning Plan', route: { kind: 'learning-plan' as const, subjectType: 'topic' as const, subjectId: topic, title: topic } },
            { label: 'Future Research Potential', route: { kind: 'future-potential' as const, topic }, active: true as const },
          ]
        : [{ label: 'Further Reading', route: { kind: 'future-potential-home' as const }, active: true as const }],
    [topic],
  )

  const title = topic || 'What should I read next?'
  const subtitle = topic
    ? 'These saved recommendation runs look at what you have already read, find newer papers in this topic that cite that foundation, and surface the strongest next reads.'
    : 'This page starts from papers you have already marked as read, finds unread papers that cite them, and ranks the strongest next reads first.'

  return (
    <ArtifactPageLayout
      activeNav="future"
      eyebrow="Future Research Potential"
      title={title}
      subtitle={subtitle}
      provider={data?.provider}
      createdAt={data?.created_at}
      navItems={navItems}
      onNavigate={onNavigate}
      onBackHome={onBackHome}
      onRefresh={() => {
        setIsRefreshing(true)
        void load({ refresh: true })
          .catch((error) => toast.error(getErrorMessage(error, 'Failed to regenerate recommendations.')))
          .finally(() => setIsRefreshing(false))
      }}
      isRefreshing={isRefreshing}
      history={history}
      onSelectHistory={(artifactId) => {
        setIsLoading(true)
        void load({ artifactId })
          .catch((error) => toast.error(getErrorMessage(error, 'Failed to load saved recommendations.')))
          .finally(() => setIsLoading(false))
      }}
      activeArtifactId={data?.artifact_id}
    >
      {isLoading ? (
        <div className="flex items-center gap-3 rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading future potential…</p>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card/60 p-6 text-sm text-muted-foreground backdrop-blur-xl">
          {topic
            ? 'No future-potential recommendations are available for this topic yet.'
            : 'No read-history recommendations are available yet. Mark a few papers as read and this page will automatically suggest what to read next.'}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
          <div className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
            {connectionGraph.nodes.length > 0 && connectionGraph.links.length > 0 ? (
              <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-background/35">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-foreground">
                  <Network className="h-4 w-4 text-primary" />
                  <span className="font-medium">Why these papers connect to your reading history</span>
                </div>
                <div className="h-[320px]">
                  <GraphCanvas
                    data={connectionGraph}
                    layoutMode="paper-network"
                    autoFitPadding={90}
                    readPaperIds={new Set(connectionGraph.nodes.filter((node) => node.read).map((node) => node.id))}
                    onNodeClick={(node) => onNavigate({ kind: 'paper', paperId: node.id, title: node.label })}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2 text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">Recommended next reads</span>
            </div>
            <div className="mt-5 flex flex-col gap-4">
              {data.items.map((item, index) => (
                <div key={item.paper.id} className="rounded-2xl border border-border bg-background/35 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-primary/75">Recommendation {index + 1}</p>
                      <h2 className="mt-2 text-lg font-semibold">{item.paper.title || item.paper.id}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.paper.year ? `${item.paper.year} • ` : ''}
                        {(item.paper.citationCount ?? 0).toLocaleString()} citations
                      </p>
                    </div>
                    <Button variant="outline" className="border-border bg-background/35" onClick={() => onNavigate({ kind: 'paper', paperId: item.paper.id, title: item.paper.title ?? undefined })}>
                      Open paper
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-foreground/80">{item.reason}</p>
                  {item.evidence.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.evidence.map((evidence) => (
                        <Badge key={`${item.paper.id}-${evidence.paper_id}`} variant="outline" wrap className="max-w-full text-left text-xs">
                          {evidence.note ? `${evidence.relation}: ${evidence.note}` : `${evidence.relation}: ${evidence.paper_id}`}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">How it works</p>
              <p className="mt-3 text-sm leading-7 text-foreground/80">
                The graph starts from papers you have already marked as read, looks for unread papers that cite them, and ranks papers higher when they cite multiple papers from your existing reading history.
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Jump back</p>
              <div className="mt-4 flex flex-col gap-2">
                {topic ? (
                  <Button variant="outline" className="justify-start border-border bg-background/35" onClick={() => onNavigate({ kind: 'learning-plan', subjectType: 'topic', subjectId: topic, title: topic })}>
                    Open saved learning plan
                  </Button>
                ) : null}
                {topic ? (
                  <Button variant="outline" className="justify-start border-border bg-background/35" onClick={() => onNavigate({ kind: 'topic', topic })}>
                    Open topic in graph
                  </Button>
                ) : null}
                <Button variant="outline" className="justify-start border-border bg-background/35" onClick={onBackHome}>
                  Open research graph
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ArtifactPageLayout>
  )
}
