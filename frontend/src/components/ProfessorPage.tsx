import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { fetchArtifactHistory, fetchAuthorNetwork, fetchProfessorBrief } from '@/api/graph'
import ArtifactPageLayout from '@/components/ArtifactPageLayout'
import GraphCanvas from '@/components/GraphCanvas'
import ProfessorBriefPanel from '@/components/ProfessorBriefPanel'
import { getErrorMessage } from '@/lib/errors'
import type { AppRoute } from '@/lib/routes'
import type { GraphData, ProfessorBrief } from '@/types/graph'

interface ProfessorPageProps {
  authorId: string
  userId: string
  onNavigate: (route: AppRoute) => void
  onBackHome: () => void
}

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] }

export default function ProfessorPage({
  authorId,
  userId,
  onNavigate,
  onBackHome,
}: ProfessorPageProps) {
  const [data, setData] = useState<ProfessorBrief | null>(null)
  const [network, setNetwork] = useState<GraphData>(EMPTY_GRAPH)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof fetchArtifactHistory>>['items']>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const load = async (options?: { refresh?: boolean; artifactId?: number }) => {
    const [brief, graph, nextHistory] = await Promise.all([
      fetchProfessorBrief(authorId, userId, { refresh: options?.refresh, artifactId: options?.artifactId }),
      fetchAuthorNetwork(authorId),
      fetchArtifactHistory('professor_brief', 'author', authorId, userId),
    ])
    setData(brief)
    setNetwork(graph)
    setHistory(nextHistory.items)
  }

  useEffect(() => {
    setIsLoading(true)
    void load()
      .catch((error) => toast.error(getErrorMessage(error, 'Failed to load professor page.')))
      .finally(() => setIsLoading(false))
  }, [authorId, userId])

  return (
    <ArtifactPageLayout
      activeNav="professors"
      eyebrow="Professor Pitch"
      title={data?.professor.name ?? authorId}
      subtitle="See how the professor’s work evolved through their authored papers and the one-hop citation neighborhood around them."
      provider={data?.provider}
      createdAt={data?.created_at}
      navItems={[]}
      onNavigate={onNavigate}
      onBackHome={onBackHome}
      onRefresh={() => {
        setIsRefreshing(true)
        void load({ refresh: true })
          .catch((error) => toast.error(getErrorMessage(error, 'Failed to regenerate professor page.')))
          .finally(() => setIsRefreshing(false))
      }}
      isRefreshing={isRefreshing}
      history={history}
      onSelectHistory={(artifactId) => {
        setIsLoading(true)
        void load({ artifactId })
          .catch((error) => toast.error(getErrorMessage(error, 'Failed to load saved professor page.')))
          .finally(() => setIsLoading(false))
      }}
      activeArtifactId={data?.artifact_id}
    >
      {isLoading ? (
        <div className="flex items-center gap-3 rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading professor page…</p>
        </div>
      ) : !data ? (
        <div className="rounded-3xl border border-border bg-card/60 p-6 text-sm text-muted-foreground backdrop-blur-xl">
          Professor information is not available.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_28rem]">
          <div className="flex min-h-[38rem] flex-col gap-4">
            <div className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Research Evolution Graph</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Search a professor to trace their authored papers, the papers they referenced, and the papers that later cited them.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <div className="rounded-full border border-border bg-background/35 px-3 py-1.5">
                  <span className="font-medium text-[#60a5fa]">Authored</span> {network.nodes.filter((node) => node.type === 'Paper' && node.isAuthored).length}
                </div>
                <div className="rounded-full border border-border bg-background/35 px-3 py-1.5">
                  <span className="font-medium text-[#f59e0b]">Referenced</span> {network.nodes.filter((node) => node.type === 'Paper' && node.isReferenced && !node.isAuthored).length}
                </div>
                <div className="rounded-full border border-border bg-background/35 px-3 py-1.5">
                  <span className="font-medium text-[#34d399]">Citing Them</span> {network.nodes.filter((node) => node.type === 'Paper' && node.isCiting && !node.isAuthored && !node.isReferenced).length}
                </div>
              </div>
            </div>
            <div className="min-h-[34rem] overflow-hidden rounded-3xl border border-border bg-card/60 backdrop-blur-xl">
              <GraphCanvas
                data={network}
                onNodeClick={(node) => {
                  if (node.type === 'Paper') {
                    onNavigate({ kind: 'paper', paperId: node.id, title: node.label })
                  }
                }}
                layoutMode="paper-network"
                selectedNodeId={null}
                paperColorMode="professor-role"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card/60 p-4 backdrop-blur-xl">
            <ProfessorBriefPanel
              data={data}
              isLoading={false}
              onSelectPaper={(paperId, title) => onNavigate({ kind: 'paper', paperId, title: title ?? undefined })}
            />
          </div>
        </div>
      )}
    </ArtifactPageLayout>
  )
}
