import { useEffect, useMemo, useState } from 'react'
import { BookOpen, BrainCircuit, Compass, Loader2, Network, Orbit, Sparkles, Waypoints } from 'lucide-react'
import { toast } from 'sonner'

import DetailPanel from '@/components/DetailPanel'
import FuturePotentialPage from '@/components/FuturePotentialPage'
import GraphCanvas from '@/components/GraphCanvas'
import LearningPlanPage from '@/components/LearningPlanPage'
import LearningPlansIndexPage from '@/components/LearningPlansIndexPage'
import ProfessorPage from '@/components/ProfessorPage'
import ProfessorIndexPage from '@/components/ProfessorIndexPage'
import SearchBar from '@/components/SearchBar'
import TopNav from '@/components/TopNav'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  fetchDemoBootstrap,
  fetchPaperNeighbors,
  fetchScopePapers,
  fetchTopicPapers,
  searchGraph,
} from '@/api/graph'
import { useHierarchyGraph } from '@/hooks/useGraph'
import { useUser } from '@/hooks/useUser'
import { getErrorMessage } from '@/lib/errors'
import { parseRoute, pushRoute, replaceRoute, type AppRoute } from '@/lib/routes'
import { annotateGraphPaperStates, mergeGraphData } from '@/utils/graph'
import type {
  DemoBootstrap,
  GraphData,
  GraphNode,
  Paper,
  PaperStatus,
} from '@/types/graph'

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] }
const USER_ID = 'demo-user'
const HIERARCHY_TYPES = new Set(['Topic', 'Subfield', 'Field', 'Domain'])

type ExploreMode = 'hierarchy' | 'area-papers' | 'paper-network'

type GraphHistoryEntry = {
  graphData: GraphData
  viewMode: ExploreMode
  activeScopeLabel: string | null
  selectedNode: GraphNode | null
}

function toPaperNode(paper: Paper): GraphNode {
  return {
    id: paper.id,
    label: paper.title ?? paper.id,
    type: 'Paper',
    val: Math.max(paper.citationCount || 1, 1),
    year: paper.year,
    citationCount: paper.citationCount,
  }
}

export default function App() {
  const [graphData, setGraphData] = useState<GraphData>(EMPTY_GRAPH)
  const [graphHistory, setGraphHistory] = useState<GraphHistoryEntry[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [viewMode, setViewMode] = useState<ExploreMode>('hierarchy')
  const [activeScopeLabel, setActiveScopeLabel] = useState<string | null>(null)
  const [bootstrap, setBootstrap] = useState<DemoBootstrap | null>(null)
  const [route, setRoute] = useState<AppRoute>(() => parseRoute())

  const { data: hierarchyData, isLoading: isHierarchyLoading, error: hierarchyError } = useHierarchyGraph()
  const { readPaperIds, toggleRead, setStatus, isRead, getStatus, refreshStatuses } = useUser(USER_ID)

  const displayGraphData = useMemo(
    () => annotateGraphPaperStates(graphData, readPaperIds),
    [graphData, readPaperIds],
  )

  useEffect(() => {
    void refreshStatuses()
    void fetchDemoBootstrap()
      .then(setBootstrap)
      .catch((error) => toast.error(getErrorMessage(error, 'Failed to load demo bootstrap.')))
  }, [refreshStatuses])

  useEffect(() => {
    const handlePopState = () => setRoute(parseRoute())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!hierarchyData) return
    setGraphData((current) => (current.nodes.length === 0 && current.links.length === 0 ? hierarchyData : current))
  }, [hierarchyData])

  const navigate = (nextRoute: AppRoute, mode: 'push' | 'replace' = 'push') => {
    setRoute(nextRoute)
    if (mode === 'replace') replaceRoute(nextRoute)
    else pushRoute(nextRoute)
  }

  const openFreshGraph = (
    nextGraph: GraphData,
    nextMode: ExploreMode,
    nextScopeLabel: string | null,
    nextSelectedNode: GraphNode | null = null,
  ) => {
    setGraphHistory((current) => [...current, { graphData, viewMode, activeScopeLabel, selectedNode }])
    setGraphData(nextGraph)
    setViewMode(nextMode)
    setActiveScopeLabel(nextScopeLabel)
    setSelectedNode(nextSelectedNode)
  }

  const resetGraphState = () => {
    setGraphHistory([])
    setViewMode('hierarchy')
    setSelectedNode(null)
    setActiveScopeLabel(null)
    if (hierarchyData) setGraphData(hierarchyData)
  }

  const handleGoBack = () => {
    if (window.history.length > 1 && route.kind !== 'home') {
      window.history.back()
      return
    }
    setGraphHistory((current) => {
      const previous = current.at(-1)
      if (!previous) return current
      setGraphData(previous.graphData)
      setViewMode(previous.viewMode)
      setActiveScopeLabel(previous.activeScopeLabel)
      setSelectedNode(previous.selectedNode)
      return current.slice(0, -1)
    })
  }

  const focusTopicInGraph = async (topic: string, options?: { replace?: boolean }) => {
    const replace = options?.replace ?? false
    const results = await searchGraph(topic)
    const bestTopic = results.topics[0]
    if (bestTopic?.id) {
      const topicGraph = await fetchTopicPapers(bestTopic.id)
      if (replace) {
        setGraphData(topicGraph)
        setViewMode('area-papers')
        setActiveScopeLabel(bestTopic.name)
        setSelectedNode(null)
      } else {
        openFreshGraph(topicGraph, 'area-papers', bestTopic.name)
      }
      return
    }
    throw new Error(`No topic graph found for "${topic}"`)
  }

  const openPaperInGraph = async (paperId: string, title?: string, options?: { replace?: boolean }) => {
    const replace = options?.replace ?? false
    setSelectedNode(toPaperNode({ id: paperId, title: title ?? paperId, year: undefined, abstract: '', citationCount: undefined }))
    setActiveScopeLabel(title ?? paperId)
    setViewMode('paper-network')
    const network = await fetchPaperNeighbors(paperId)
    if (replace) setGraphData(network)
    else openFreshGraph(network, 'paper-network', title ?? paperId, toPaperNode({ id: paperId, title: title ?? paperId, year: undefined, abstract: '', citationCount: undefined }))
  }

  useEffect(() => {
    if (!hierarchyData) return

    const applyRoute = async () => {
      if (route.kind === 'home') {
        resetGraphState()
        return
      }
      if (route.kind === 'learning-plans' || route.kind === 'future-potential-home' || route.kind === 'professors-home') {
        return
      }
      if (route.kind === 'topic') {
        await focusTopicInGraph(route.topic, { replace: true })
        return
      }
      if (route.kind === 'paper') {
        await openPaperInGraph(route.paperId, route.title, { replace: true })
      }
    }

    if (
      route.kind === 'learning-plan' ||
      route.kind === 'future-potential' ||
      route.kind === 'professor' ||
      route.kind === 'learning-plans' ||
      route.kind === 'future-potential-home' ||
      route.kind === 'professors-home'
    ) return
    void applyRoute().catch((error) => toast.error(getErrorMessage(error, 'Failed to apply route.')))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, hierarchyData])

  useEffect(() => {
    if (!hierarchyError) return
    toast.error(getErrorMessage(hierarchyError, 'Failed to load graph.'))
  }, [hierarchyError])

  const handleNodeClick = async (node: GraphNode) => {
    if (!node?.id || !node?.type) return

    if (node.type === 'Paper') {
      setSelectedNode(node)
      setActiveScopeLabel(node.label)
      if (viewMode === 'paper-network') {
        try {
          const network = await fetchPaperNeighbors(node.id)
          openFreshGraph(network, 'paper-network', node.label, node)
        } catch (error) {
          toast.error(getErrorMessage(error, 'Failed to load paper network.'))
        }
      }
      return
    }

    if (node.type === 'Author') {
      navigate({ kind: 'professor', authorId: node.id })
      return
    }

    if (node.type === 'External') return

    setSelectedNode(null)
    setActiveScopeLabel(node.label)
    if (!HIERARCHY_TYPES.has(node.type)) return

    try {
      const scopeGraph = await fetchScopePapers(node.type, node.id)
      openFreshGraph(scopeGraph, 'area-papers', node.label)
    } catch (error) {
      if (node.type === 'Topic') {
        try {
          const topicGraph = await fetchTopicPapers(node.id)
          setGraphData((current) => mergeGraphData(current, topicGraph))
          return
        } catch (topicError) {
          toast.error(getErrorMessage(topicError, 'Failed to load this topic.'))
          return
        }
      }
      toast.error(getErrorMessage(error, 'Failed to load this scope.'))
    }
  }

  const handleSelectPaper = (paper: Paper, options?: { syncRoute?: boolean }) => {
    setSelectedNode(toPaperNode(paper))
    setActiveScopeLabel(paper.title ?? paper.id)
    if (options?.syncRoute !== false) {
      navigate({ kind: 'paper', paperId: paper.id, title: paper.title ?? undefined })
    }
  }

  const handleSelectPaperById = async (paperId: string, title?: string | null, options?: { syncRoute?: boolean }) => {
    handleSelectPaper({ id: paperId, title: title ?? paperId, year: undefined, abstract: '', citationCount: undefined }, options)
  }

  const handleOpenLearningPlanForPaper = (paperId: string, title?: string | null) => {
    navigate({ kind: 'learning-plan', subjectType: 'paper', subjectId: paperId, title: title ?? undefined })
  }

  const handleOpenLearningPlanForTopic = (topic: string) => {
    navigate({ kind: 'learning-plan', subjectType: 'topic', subjectId: topic, title: topic })
  }

  const handleSetStatus = async (paperId: string, status: PaperStatus) => {
    await setStatus(paperId, status)
  }

  const graphNodeCount = graphData.nodes.length
  const loadedPaperCount = displayGraphData.nodes.filter((node) => node.type === 'Paper').length
  const visiblePapers = [...displayGraphData.nodes]
    .filter((node) => node.type === 'Paper')
    .sort((a, b) => (b.citationCount ?? b.val ?? 0) - (a.citationCount ?? a.val ?? 0))
    .slice(0, 12)
  const selectedPaperId = selectedNode?.type === 'Paper' ? selectedNode.id : null
  const selectedPaperTitle = selectedNode?.type === 'Paper' ? selectedNode.label : null
  const isUnlocked = (paperId: string) =>
    displayGraphData.nodes.some((node) => node.type === 'Paper' && node.id === paperId && Boolean(node.unlocked))

  if (route.kind === 'learning-plan') {
    return (
      <LearningPlanPage
        subjectType={route.subjectType}
        subjectId={route.subjectId}
        title={route.title}
        userId={USER_ID}
        isRead={isRead}
        onSetStatus={(paperId) => void handleSetStatus(paperId, 'read')}
        onNavigate={(nextRoute) => navigate(nextRoute)}
        onBackHome={() => navigate({ kind: 'home' })}
      />
    )
  }

  if (route.kind === 'learning-plans') {
    return <LearningPlansIndexPage userId={USER_ID} onNavigate={(nextRoute) => navigate(nextRoute)} />
  }

  if (route.kind === 'future-potential') {
    return (
      <FuturePotentialPage
        topic={route.topic}
        userId={USER_ID}
        onNavigate={(nextRoute) => navigate(nextRoute)}
        onBackHome={() => navigate({ kind: 'home' })}
      />
    )
  }

  if (route.kind === 'future-potential-home') {
    return (
      <FuturePotentialPage
        userId={USER_ID}
        onNavigate={(nextRoute) => navigate(nextRoute)}
        onBackHome={() => navigate({ kind: 'home' })}
      />
    )
  }

  if (route.kind === 'professor') {
    return (
      <ProfessorPage
        authorId={route.authorId}
        userId={USER_ID}
        onNavigate={(nextRoute) => navigate(nextRoute)}
        onBackHome={() => navigate({ kind: 'home' })}
      />
    )
  }

  if (route.kind === 'professors-home') {
    return <ProfessorIndexPage bootstrap={bootstrap} onNavigate={(nextRoute) => navigate(nextRoute)} />
  }

  if (isHierarchyLoading && graphNodeCount === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading research landscape...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(245,158,11,0.16),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(96,165,250,0.18),transparent_26%),radial-gradient(circle_at_54%_78%,rgba(52,211,153,0.12),transparent_24%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] opacity-40" />

      <div className="relative flex h-full min-h-0 flex-col">
        <TopNav active="graph" onNavigate={(nextRoute) => navigate(nextRoute)} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)_28rem]">
        <aside className="hidden h-full min-h-0 border-r border-border bg-card/60 backdrop-blur-xl lg:flex lg:flex-col">
          <ScrollArea className="min-h-0 flex-1 p-5">
            <p className="text-[11px] uppercase tracking-[0.28em] text-primary/80">Scholar Graph</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-foreground">
              Explore the graph here, then open dedicated artifact pages when you want to study, plan, or evaluate a professor.
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The graph is now the exploration hub. Learning plans, future-potential recommendations, and professor pages live on separate saved views.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">Neo4j graph</Badge>
              <Badge variant="outline">Saved artifacts</Badge>
              <Badge variant="outline">{bootstrap?.provider ?? 'RocketRide'}</Badge>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-background/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Orbit className="h-4 w-4" />
                  <span className="text-[11px] uppercase tracking-[0.18em]">Nodes</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{graphNodeCount.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Network className="h-4 w-4" />
                  <span className="text-[11px] uppercase tracking-[0.18em]">Loaded papers</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{loadedPaperCount.toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-border bg-background/35 p-4">
              <div className="mb-3 flex items-center gap-2 text-foreground">
                <Compass className="h-4 w-4 text-primary" />
                <span className="font-medium">Featured launches</span>
              </div>
              <div className="grid gap-2">
                {(bootstrap?.featured_topics ?? ['Transformers', 'Diffusion models', 'Retrieval-augmented generation']).map((topic) => (
                  <div key={topic} className="rounded-2xl border border-border bg-background/40 p-3">
                    <p className="text-sm font-medium text-foreground">{topic}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" className="border-border bg-background/35" onClick={() => handleOpenLearningPlanForTopic(topic)}>
                        <BookOpen data-icon="inline-start" />
                        Learning plan
                      </Button>
                      <Button variant="outline" className="border-border bg-background/35" onClick={() => navigate({ kind: 'future-potential', topic })}>
                        <Sparkles data-icon="inline-start" />
                        Future potential
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-border bg-background/35 p-4">
              <div className="mb-3 flex items-center gap-2 text-foreground">
                <BrainCircuit className="h-4 w-4 text-primary" />
                <span className="font-medium">Current launch pad</span>
              </div>
              {selectedPaperId ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">Selected paper: {selectedPaperTitle}</p>
                  <Button onClick={() => handleOpenLearningPlanForPaper(selectedPaperId, selectedPaperTitle)}>
                    <BookOpen data-icon="inline-start" />
                    Open paper learning plan
                  </Button>
                </div>
              ) : activeScopeLabel ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">Active topic/scope: {activeScopeLabel}</p>
                  <Button onClick={() => handleOpenLearningPlanForTopic(activeScopeLabel)}>
                    <BookOpen data-icon="inline-start" />
                    Open topic learning plan
                  </Button>
                  <Button variant="outline" className="border-border bg-background/35" onClick={() => navigate({ kind: 'future-potential', topic: activeScopeLabel })}>
                    <Sparkles data-icon="inline-start" />
                    Open future potential
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a paper or focus a topic in the graph to launch a dedicated artifact page.</p>
              )}
            </div>

            <div className="mt-5 rounded-3xl border border-border bg-background/35 p-4">
              <div className="mb-3 flex items-center gap-2 text-foreground">
                <Waypoints className="h-4 w-4 text-primary" />
                <span className="font-medium">Papers in view</span>
              </div>
              <div className="space-y-2">
                {visiblePapers.map((paper) => (
                  <button
                    key={paper.id}
                    type="button"
                    onClick={() => void handleSelectPaperById(paper.id, paper.label)}
                    className="w-full rounded-xl border border-border bg-background/40 px-3 py-2 text-left transition hover:bg-accent"
                  >
                    <p className="line-clamp-2 text-sm font-medium text-foreground">{paper.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {(getStatus(paper.id) ?? 'to_read').replace('_', ' ')} • {(paper.citationCount ?? paper.val ?? 0).toLocaleString()} citations
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </ScrollArea>
        </aside>

        <div className="flex min-h-0 flex-col">
          <div className="mb-3">
            <SearchBar
              onSelectPaper={handleSelectPaper}
              onSelectAuthor={(author) => navigate({ kind: 'professor', authorId: author.id })}
              onMergeGraph={(incoming) => setGraphData((current) => mergeGraphData(current, incoming))}
              onLearnTopic={(topic) => handleOpenLearningPlanForTopic(topic)}
              nodeCount={graphNodeCount}
              paperCount={loadedPaperCount}
            />
          </div>

          <div className="px-6 pb-3">
            <div className="rounded-3xl border border-border bg-card/55 p-4 backdrop-blur-xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Graph exploration hub</p>
                  <h2 className="mt-1 text-xl font-semibold text-foreground">
                    {activeScopeLabel ?? 'Start from a topic, paper, or professor'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Use the graph to trace the field, then jump into dedicated saved pages for learning plans, next reads, and professor research evolution.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="border-border bg-background/35" onClick={handleGoBack} disabled={graphHistory.length === 0}>
                    Back
                  </Button>
                  <Button variant="outline" className="border-border bg-background/35" onClick={() => navigate({ kind: 'home' }, 'replace')}>
                    Reset graph
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 px-6 pb-6">
            <GraphCanvas
              data={displayGraphData}
              onNodeClick={handleNodeClick}
              layoutMode={viewMode}
              selectedNodeId={selectedNode?.id}
              readPaperIds={readPaperIds}
            />
          </div>
        </div>

        <div className="hidden min-h-0 xl:block">
          <div className="h-full border-l border-border bg-card/60 p-4 backdrop-blur-xl">
            <DetailPanel
              paperId={selectedPaperId}
              userId={USER_ID}
              onLearnThis={(paperId) => handleOpenLearningPlanForPaper(paperId, selectedPaperTitle)}
              onClose={() => {
                setSelectedNode(null)
                navigate(route.kind === 'topic' ? route : { kind: 'home' }, 'replace')
              }}
              isRead={isRead}
              isUnlocked={isUnlocked}
              onToggleRead={(paperId) => void toggleRead(paperId)}
              getStatus={getStatus}
              onSetStatus={(paperId, status) => void handleSetStatus(paperId, status)}
              onSelectPaper={handleSelectPaper}
            />
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
