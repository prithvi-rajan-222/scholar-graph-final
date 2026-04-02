import type { GraphNode } from '@/types/graph'

interface NodeTooltipProps {
  node: GraphNode | null
  position: { x: number; y: number }
}

export default function NodeTooltip({ node, position }: NodeTooltipProps) {
  if (!node) {
    return null
  }

  return (
    <div
      className="pointer-events-none absolute max-w-72 rounded-2xl border border-border bg-popover/95 px-4 py-3 text-xs text-popover-foreground shadow-2xl shadow-black/20 backdrop-blur-xl"
      style={{
        left: Math.max(16, Math.min(position.x + 20, window.innerWidth - 320)),
        top: Math.max(position.y + 20, 16),
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {node.type}
        </span>
        {node.year ? (
          <span className="text-[11px] text-muted-foreground">{node.year}</span>
        ) : null}
        {node.type === 'Paper' ? (
          <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground">
            {node.read ? 'Read' : node.unlocked ? 'Unlocked' : 'Unread'}
          </span>
        ) : null}
      </div>
      <p className="font-medium leading-relaxed text-foreground">{node.label}</p>
      {node.citationCount != null ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {node.citationCount.toLocaleString()} citations
        </p>
      ) : node.paperCount != null ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {node.paperCount.toLocaleString()} papers beneath this node
        </p>
      ) : null}
      {node.type === 'Paper' && node.inScope === false ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Connected paper outside the selected area
        </p>
      ) : null}
    </div>
  )
}
