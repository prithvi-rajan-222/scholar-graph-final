import type { GraphData, GraphNode } from '@/types/graph'

function getLinkEndId(end: string | GraphNode): string {
  return typeof end === 'object' ? end.id : end
}

export function mergeGraphData(existing: GraphData, incoming: GraphData): GraphData {
  const nodeMap = new Map(existing.nodes.map((node) => [node.id, node]))
  for (const node of incoming.nodes) {
    nodeMap.set(node.id, { ...nodeMap.get(node.id), ...node })
  }

  const linkKeys = new Set(
    existing.links.map((link) => `${getLinkEndId(link.source)}-${getLinkEndId(link.target)}-${link.type}`),
  )
  const newLinks = incoming.links.filter(
    (link) => !linkKeys.has(`${getLinkEndId(link.source)}-${getLinkEndId(link.target)}-${link.type}`),
  )

  return {
    nodes: [...nodeMap.values()],
    links: [...existing.links, ...newLinks],
  }
}

export function annotateGraphPaperStates(data: GraphData, readPaperIds: Set<string>): GraphData {
  const unlockedIds = new Set<string>()

  for (const link of data.links) {
    const sourceId = getLinkEndId(link.source)
    const targetId = getLinkEndId(link.target)

    if (link.type === 'CITED_BY' && readPaperIds.has(sourceId) && !readPaperIds.has(targetId)) {
      unlockedIds.add(targetId)
    }

    if (link.type === 'CITES' && readPaperIds.has(targetId) && !readPaperIds.has(sourceId)) {
      unlockedIds.add(sourceId)
    }
  }

  return {
    nodes: data.nodes.map((node) => {
      if (node.type !== 'Paper') {
        return node
      }

      const isRead = readPaperIds.has(node.id) || Boolean(node.read)
      const isUnlocked = !isRead && (unlockedIds.has(node.id) || Boolean(node.unlocked))

      return {
        ...node,
        read: isRead,
        unlocked: isUnlocked,
      }
    }),
    links: data.links,
  }
}
