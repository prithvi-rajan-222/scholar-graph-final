import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { forceCollide } from 'd3-force-3d'
import ForceGraph2D from 'react-force-graph-2d'

import NodeTooltip from '@/components/NodeTooltip'
import type { GraphData, GraphLink, GraphNode, NodeType } from '@/types/graph'

const LABEL_TYPES: Set<NodeType> = new Set(['Paper', 'Topic', 'Field', 'Subfield', 'External'])
const DIRECTED_LINK_TYPES = new Set(['CITES', 'CITED_BY', 'EXTERNAL_CITES', 'EXTERNAL_CITED_BY'])

type ForceNode = GraphNode & {
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
  __layoutLocked?: boolean
}

type ForceLink = GraphLink & {
  source: string | ForceNode
  target: string | ForceNode
}

type ForceGraphHandle = {
  d3Force: (forceName: string, forceFn?: unknown | null) => unknown
  d3ReheatSimulation: () => unknown
  pauseAnimation: () => unknown
  resumeAnimation: () => unknown
  zoomToFit: (durationMs?: number, padding?: number) => unknown
}

type ThemeColors = {
  background: string
  foreground: string
  mutedForeground: string
  border: string
  paperStateColors: {
    unread: string
    unlocked: string
    read: string
  }
  nodeColors: Record<NodeType, string>
  professorPaperColors: {
    authored: string
    references: string
    citations: string
  }
  linkColors: Record<string, string>
}

interface GraphCanvasProps {
  data: GraphData
  onNodeClick: (node: GraphNode) => void
  onNodeHover?: (node: GraphNode | null) => void
  layoutMode?: 'hierarchy' | 'area-papers' | 'paper-network'
  selectedNodeId?: string | null
  readPaperIds?: Set<string>
  autoFitPadding?: number
  paperColorMode?: 'status' | 'professor-role'
}

function isTimelineLayout(layoutMode: GraphCanvasProps['layoutMode']): boolean {
  return layoutMode === 'area-papers' || layoutMode === 'paper-network'
}

function getDefaultAutoFitPadding(layoutMode: GraphCanvasProps['layoutMode']): number {
  if (layoutMode === 'hierarchy') return 80
  if (layoutMode === 'paper-network') return 70
  return 90
}

function createTimelineForce({
  minYear,
  maxYear,
  timelineStart,
  timelineWidth,
}: {
  minYear: number
  maxYear: number
  timelineStart: number
  timelineWidth: number
}) {
  let nodes: ForceNode[] = []
  const span = Math.max(maxYear - minYear, 1)

  const force = (alpha: number) => {
    for (const node of nodes) {
      let targetX = 0
      let xStrength = 0.06
      let targetY = 0
      let yStrength = 0.045

      if (node.type === 'External') {
        targetX = timelineStart - 140
        xStrength = 0.32
      } else if (node.type === 'Paper' && node.year != null) {
        const normalizedYear = (node.year - minYear) / span
        targetX = timelineStart + normalizedYear * timelineWidth
        xStrength = 0.42
      }

      if (node.type === 'Author') {
        targetY = 180
        yStrength = 0.16
      }

      node.vx = (node.vx ?? 0) + (targetX - (node.x ?? 0)) * xStrength * alpha
      node.vy = (node.vy ?? 0) + (targetY - (node.y ?? 0)) * yStrength * alpha
    }
  }

  force.initialize = (nextNodes: ForceNode[]) => {
    nodes = nextNodes
  }

  return force
}

function getLinkWidth(link: ForceLink): number {
  if (link.type === 'CITES') return 2.2
  if (link.type === 'CITED_BY') return 2.6
  if (link.type === 'COVERS') return 1.9
  if (link.type === 'AUTHORED_BY') return 1.55
  if (link.type === 'EXTERNAL_CITES' || link.type === 'EXTERNAL_CITED_BY') return 2
  return 1.35
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  source: ForceNode,
  target: ForceNode,
  color: string,
  targetRadius: number,
  size: number,
) {
  const dx = (target.x ?? 0) - (source.x ?? 0)
  const dy = (target.y ?? 0) - (source.y ?? 0)
  const length = Math.hypot(dx, dy)
  if (length < 0.001) return

  const ux = dx / length
  const uy = dy / length
  const tipX = (target.x ?? 0) - ux * (targetRadius + 2)
  const tipY = (target.y ?? 0) - uy * (targetRadius + 2)
  const baseX = tipX - ux * size
  const baseY = tipY - uy * size
  const perpX = -uy
  const perpY = ux
  const wing = size * 0.55

  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(baseX + perpX * wing, baseY + perpY * wing)
  ctx.lineTo(baseX - perpX * wing, baseY - perpY * wing)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function getNodeRadius(node: ForceNode, inDegree?: Map<string, number>): number {
  const localDegree = inDegree?.get(node.id) ?? 0
  const magnitude = Math.max(node.citationCount ?? (localDegree > 0 ? localDegree * 30 : null) ?? node.val ?? 1, 1)

  if (node.type === 'Paper') {
    return Math.max(7, Math.min(42, 4 + Math.sqrt(magnitude) * 0.95))
  }

  if (node.type === 'External') {
    return Math.max(8, Math.min(20, 6 + Math.log10(magnitude + 1) * 4.2))
  }

  const baseByType: Record<Exclude<NodeType, 'Paper'>, number> = {
    Author: 4,
    Topic: 6,
    Subfield: 7.5,
    Field: 9,
    Domain: 11,
    External: 8,
  }

  const spreadByType: Record<Exclude<NodeType, 'Paper'>, number> = {
    Author: 1.8,
    Topic: 5.2,
    Subfield: 6.2,
    Field: 7.2,
    Domain: 8.2,
    External: 3.2,
  }

  return Math.max(
    baseByType[node.type],
    Math.min(40, baseByType[node.type] + Math.log10(magnitude + 1) * spreadByType[node.type]),
  )
}

function getLinkEndpoints(source: ForceNode, target: ForceNode, targetRadius: number, arrowSize: number, inDegree?: Map<string, number>) {
  const dx = (target.x ?? 0) - (source.x ?? 0)
  const dy = (target.y ?? 0) - (source.y ?? 0)
  const length = Math.hypot(dx, dy)
  if (length < 0.001) return null

  const ux = dx / length
  const uy = dy / length
  const sourceRadius = getNodeRadius(source, inDegree) + 2
  const targetInset = targetRadius + arrowSize + 3
  if (length <= sourceRadius + targetInset) return null

  return {
    startX: (source.x ?? 0) + ux * sourceRadius,
    startY: (source.y ?? 0) + uy * sourceRadius,
    endX: (target.x ?? 0) - ux * targetInset,
    endY: (target.y ?? 0) - uy * targetInset,
  }
}

function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim()
    if (!value) return fallback
    if (
      value.startsWith('oklch(') ||
      value.startsWith('rgb(') ||
      value.startsWith('rgba(') ||
      value.startsWith('hsl(') ||
      value.startsWith('hsla(') ||
      value.startsWith('#')
    ) {
      return value
    }
    return `oklch(${value})`
  }

  return {
    background: token('--background', '#0f0f0f'),
    foreground: token('--foreground', '#f4f4f5'),
    mutedForeground: token('--muted-foreground', 'rgba(212, 212, 216, 0.75)'),
    border: token('--border', 'rgba(255, 255, 255, 0.12)'),
    paperStateColors: {
      unread: token('--graph-paper-unread', token('--graph-paper', '#60a5fa')),
      unlocked: token('--graph-paper-unlocked', '#f59e0b'),
      read: token('--graph-paper-read', '#34d399'),
    },
    nodeColors: {
      Paper: token('--graph-paper', '#60a5fa'),
      Author: token('--graph-author', '#34d399'),
      Topic: token('--graph-topic', '#f59e0b'),
      Subfield: token('--graph-subfield', '#a78bfa'),
      Field: token('--graph-field', '#f472b6'),
      Domain: token('--graph-domain', '#fb923c'),
      External: token('--graph-external', '#c084fc'),
    },
    professorPaperColors: {
      authored: token('--graph-professor-authored', '#60a5fa'),
      references: token('--graph-professor-references', '#f59e0b'),
      citations: token('--graph-professor-citations', '#34d399'),
    },
    linkColors: {
      CITES: token('--graph-link-cites', 'rgba(96, 165, 250, 0.42)'),
      CITED_BY: token('--graph-link-cited-by', 'rgba(129, 140, 248, 0.6)'),
      AUTHORED_BY: token('--graph-link-authored', 'rgba(52, 211, 153, 0.34)'),
      COVERS: token('--graph-link-covers', 'rgba(245, 158, 11, 0.38)'),
      BELONGS_TO: token('--graph-link-belongs', 'rgba(255, 255, 255, 0.28)'),
      EXTERNAL_CITES: token('--graph-link-external', 'rgba(255, 168, 76, 0.6)'),
      EXTERNAL_CITED_BY: token('--graph-link-external', 'rgba(255, 168, 76, 0.6)'),
      IN_SCOPE: token('--graph-link-scope', 'rgba(166, 174, 255, 0.28)'),
    },
  }
}

export default function GraphCanvas({
  data,
  onNodeClick,
  onNodeHover,
  layoutMode = 'hierarchy',
  selectedNodeId,
  readPaperIds,
  autoFitPadding,
  paperColorMode = 'status',
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphHandle | undefined>(undefined)
  const hoveredNodeRef = useRef<GraphNode | null>(null)
  const hasAutoFitRef = useRef(false)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const mousePositionRef = useRef({ x: 0, y: 0 })
  const mouseFrameRef = useRef<number | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })

  const themeColors = useMemo(() => readThemeColors(), [])
  const timelineLayout = isTimelineLayout(layoutMode)
  const renderedGraphData = useMemo(
    () => ({
      nodes: data.nodes.map((node) => ({ ...node })) as ForceNode[],
      links: data.links.map((link) => ({ ...link })) as ForceLink[],
    }),
    [data],
  )
  const isDenseGraph = renderedGraphData.nodes.length > 140 || renderedGraphData.links.length > 260
  const isVeryDenseGraph = renderedGraphData.nodes.length > 240 || renderedGraphData.links.length > 420

  const citesInDegree = useMemo(() => {
    const map = new Map<string, number>()
    for (const link of renderedGraphData.links) {
      if (link.type !== 'CITES') continue
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      map.set(targetId, (map.get(targetId) ?? 0) + 1)
    }
    return map
  }, [renderedGraphData.links])

  const handleNodeHover = useCallback((node: ForceNode | null) => {
    hoveredNodeRef.current = node
    setHoveredNode(node)
    onNodeHover?.(node)
  }, [onNodeHover])

  const handleBackgroundClick = useCallback(() => {
    hoveredNodeRef.current = null
    setHoveredNode(null)
    onNodeHover?.(null)
  }, [onNodeHover])

  const nodeCanvasObject = useCallback(
    (node: ForceNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isRead = node.type === 'Paper' && (readPaperIds?.has(node.id) || node.read)
      const isUnlocked = node.type === 'Paper' && !isRead && Boolean(node.unlocked)
      const isSelected = selectedNodeId === node.id
      const isHovered = hoveredNodeRef.current?.id === node.id
      const shouldGlow = !isDenseGraph || isSelected || isHovered
      const color = node.type === 'Paper'
        ? paperColorMode === 'professor-role'
          ? node.isAuthored
            ? themeColors.professorPaperColors.authored
            : node.isReferenced
              ? themeColors.professorPaperColors.references
              : node.isCiting
                ? themeColors.professorPaperColors.citations
                : themeColors.paperStateColors.unread
          : isRead
            ? themeColors.paperStateColors.read
            : isUnlocked
              ? themeColors.paperStateColors.unlocked
              : themeColors.paperStateColors.unread
        : themeColors.nodeColors[node.type] ?? themeColors.nodeColors.Paper
      const radius = getNodeRadius(node, citesInDegree)

      ctx.save()

      if (isSelected || isHovered) {
        ctx.beginPath()
        ctx.arc(node.x ?? 0, node.y ?? 0, radius + 6, 0, 2 * Math.PI)
        ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 255, 255, 0.14)'
        ctx.fill()
      }

      ctx.shadowBlur = shouldGlow ? (isSelected ? 18 : isHovered ? 12 : 6) : 0
      ctx.shadowColor = color

      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()

      if (node.type === 'Paper' && node.inScope === false) {
        ctx.beginPath()
        ctx.arc(node.x ?? 0, node.y ?? 0, radius + 3, 0, 2 * Math.PI)
        ctx.lineWidth = 1.3
        ctx.setLineDash([4, 3])
        ctx.strokeStyle = themeColors.border
        ctx.stroke()
        ctx.setLineDash([])
      } else if (node.type === 'Paper' && node.inScope === true) {
        ctx.beginPath()
        ctx.arc(node.x ?? 0, node.y ?? 0, radius + 4, 0, 2 * Math.PI)
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)'
        ctx.stroke()
      }

      ctx.shadowBlur = 0
      ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.2
      ctx.strokeStyle = isSelected || isHovered ? themeColors.foreground : themeColors.border
      ctx.stroke()

      const shouldShowLabel =
        LABEL_TYPES.has(node.type) &&
        (
          isSelected ||
          isHovered ||
          (!isDenseGraph && globalScale >= 2.2) ||
          (isDenseGraph && globalScale >= 3.1) ||
          (node.type === 'Topic' && (node.val ?? 0) >= (isDenseGraph ? 4000 : 1500))
        )

      if (!shouldShowLabel) {
        ctx.restore()
        return
      }

      const fontSize = Math.max(12 / globalScale, 3)
      ctx.font = `${isSelected ? 700 : 500} ${fontSize}px Inter Variable, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = isSelected ? themeColors.foreground : themeColors.mutedForeground

      const label = node.label.length > 28 ? `${node.label.slice(0, 28)}...` : node.label
      ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + radius + 4 / globalScale)
      ctx.restore()
    },
    [citesInDegree, isDenseGraph, paperColorMode, readPaperIds, selectedNodeId, themeColors],
  )

  const nodePointerAreaPaint = useCallback(
    (node: ForceNode, color: string, ctx: CanvasRenderingContext2D) => {
      const radius = Math.max(getNodeRadius(node, citesInDegree), 6)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI)
      ctx.fill()
    },
    [citesInDegree],
  )

  const linkCanvasObject = useCallback(
    (link: ForceLink, ctx: CanvasRenderingContext2D) => {
      const source = typeof link.source === 'object' ? link.source : null
      const target = typeof link.target === 'object' ? link.target : null
      if (source?.x == null || target?.x == null || source.y == null || target.y == null) {
        return
      }

      ctx.save()
      const lineColor = themeColors.linkColors[link.type] ?? themeColors.border
      const lineWidth = isDenseGraph ? Math.max(1, getLinkWidth(link) * 0.72) : getLinkWidth(link)
      const showArrowheads = DIRECTED_LINK_TYPES.has(link.type) && layoutMode !== 'hierarchy'
      const arrowSize = showArrowheads ? (timelineLayout ? 18 : 13) : 0
      const targetRadius = getNodeRadius(target, citesInDegree)
      const endpoints = getLinkEndpoints(source, target, targetRadius, arrowSize, citesInDegree)
      if (!endpoints) {
        ctx.restore()
        return
      }

      ctx.beginPath()
      ctx.moveTo(endpoints.startX, endpoints.startY)
      ctx.lineTo(endpoints.endX, endpoints.endY)
      ctx.strokeStyle = lineColor
      ctx.lineWidth = lineWidth
      ctx.globalAlpha = isDenseGraph ? 0.55 : hoveredNodeRef.current ? 0.98 : 0.92
      ctx.stroke()

      if (showArrowheads) {
        drawArrowhead(
          ctx,
          { ...source, x: endpoints.startX, y: endpoints.startY },
          target,
          lineColor,
          targetRadius,
          arrowSize,
        )
      }

      ctx.restore()
    },
    [citesInDegree, isDenseGraph, isVeryDenseGraph, themeColors, timelineLayout],
  )

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateSize = () => {
      setSize({
        width: Math.max(element.clientWidth, 1),
        height: Math.max(element.clientHeight, 1),
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    for (const node of renderedGraphData.nodes) {
      if (node.__layoutLocked) {
        node.fx = undefined
        node.fy = undefined
        node.__layoutLocked = false
      }
    }

    const denseGraph = renderedGraphData.nodes.length > 120 || renderedGraphData.links.length > 220 || layoutMode !== 'hierarchy'
    const chargeStrength = timelineLayout ? -520 : denseGraph ? -180 : -85
    const collidePadding = timelineLayout ? 16 : denseGraph ? 7 : 6
    const paperYears = renderedGraphData.nodes
      .filter((node) => node.type === 'Paper')
      .map((node) => node.year)
      .filter((year): year is number => typeof year === 'number')
    const minYear = paperYears.length > 0 ? Math.min(...paperYears) : null
    const maxYear = paperYears.length > 0 ? Math.max(...paperYears) : null
    const hasYearRange = minYear != null && maxYear != null && minYear !== maxYear

    ;(graph.d3Force('charge') as { strength?: (value: number) => unknown } | undefined)?.strength?.(chargeStrength)
    graph.d3Force(
      'collide',
      forceCollide<ForceNode>()
        .radius((node: ForceNode) => getNodeRadius(node, citesInDegree) + collidePadding)
        .iterations(denseGraph ? 1 : 2) as never,
    )
    ;(graph.d3Force('link') as { distance?: (value: (link: ForceLink) => number) => unknown } | undefined)?.distance?.((link: ForceLink) => {
      if (link.type === 'BELONGS_TO') return denseGraph ? 125 : 95
      if (link.type === 'EXTERNAL_CITES' || link.type === 'EXTERNAL_CITED_BY') return timelineLayout ? 230 : 135
      if (link.type === 'IN_SCOPE') return 90
      if (link.type === 'AUTHORED_BY') return timelineLayout ? 130 : 70
      return timelineLayout ? 280 : denseGraph ? 95 : 68
    })

    if (timelineLayout && hasYearRange && minYear != null && maxYear != null) {
      const span = maxYear - minYear || 1
      const timelineWidth = Math.max(1100, Math.min(2400, span * 155))
      const timelineStart = -timelineWidth / 2
      graph.d3Force(
        'timeline',
        createTimelineForce({
          minYear,
          maxYear,
          timelineStart,
          timelineWidth,
        }) as never,
      )
    } else {
      graph.d3Force('timeline', null)
    }

    graph.d3ReheatSimulation()
  }, [citesInDegree, layoutMode, renderedGraphData.links, renderedGraphData.nodes, timelineLayout])

  useEffect(() => {
    if (!graphRef.current || renderedGraphData.nodes.length === 0) return

    if (!hasAutoFitRef.current || layoutMode !== 'hierarchy') {
      window.setTimeout(() => {
        graphRef.current?.zoomToFit(500, autoFitPadding ?? getDefaultAutoFitPadding(layoutMode))
        hasAutoFitRef.current = true
      }, 150)
    }
  }, [autoFitPadding, layoutMode, renderedGraphData.links.length, renderedGraphData.nodes.length])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
      graphRef.current?.pauseAnimation()
      return
    }

    graphRef.current?.resumeAnimation()
    }

    const handleFocus = () => {
      graphRef.current?.resumeAnimation()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handleFocus)
    }
  }, [])

  const handlePointerMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!hoveredNode) return

    const bounds = event.currentTarget.getBoundingClientRect()
    mousePositionRef.current = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }

    if (mouseFrameRef.current != null) return

    mouseFrameRef.current = window.requestAnimationFrame(() => {
      mouseFrameRef.current = null
      setMousePosition(mousePositionRef.current)
    })
  }, [hoveredNode])

  useEffect(() => () => {
    if (mouseFrameRef.current != null) {
      window.cancelAnimationFrame(mouseFrameRef.current)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 flex-1 overflow-hidden"
      onMouseMove={handlePointerMove}
    >
      <ForceGraph2D<ForceNode, ForceLink>
        ref={graphRef as never}
        width={size.width}
        height={size.height}
        graphData={renderedGraphData}
        backgroundColor={themeColors.background}
        nodeId="id"
        nodeLabel={() => ''}
        autoPauseRedraw={false}
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={nodePointerAreaPaint}
        linkColor={(link) => themeColors.linkColors[link.type] ?? themeColors.border}
        linkWidth={() => 0}
        linkLineDash={(link) => (
          link.type === 'BELONGS_TO' ? [6, 6] : link.type === 'IN_SCOPE' ? [3, 5] : null
        )}
        linkCanvasObjectMode={() => 'replace'}
        linkCanvasObject={linkCanvasObject}
        linkDirectionalArrowLength={0}
        linkDirectionalParticles={0}
        enableNodeDrag={false}
        warmupTicks={timelineLayout ? 40 : 20}
        cooldownTicks={95}
        cooldownTime={4500}
        d3AlphaDecay={0.06}
        d3VelocityDecay={0.34}
        onEngineStop={() => {
          if (layoutMode === 'hierarchy') {
            return
          }

          for (const node of renderedGraphData.nodes) {
            if (node.x == null || node.y == null) {
              continue
            }

            node.fx = node.x
            node.fy = node.y
            node.__layoutLocked = true
          }
        }}
        onNodeHover={handleNodeHover}
        onNodeClick={onNodeClick}
        onBackgroundClick={handleBackgroundClick}
      />

      <NodeTooltip node={hoveredNode} position={mousePosition} />
    </div>
  )
}
