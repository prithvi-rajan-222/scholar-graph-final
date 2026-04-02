import { BookOpen, Lightbulb, MessageSquareHeart, Orbit, Rocket, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Paper, ProfessorBrief } from '@/types/graph'

interface ProfessorBriefPanelProps {
  data: ProfessorBrief | null
  isLoading: boolean
  onSelectPaper: (paperId: string, title?: string | null) => void
}

function EvidencePaperList({
  title,
  papers,
  onSelectPaper,
}: {
  title: string
  papers: Paper[]
  onSelectPaper: (paperId: string, title?: string | null) => void
}) {
  if (papers.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-background/35 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <BookOpen className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="space-y-2">
        {papers.map((paper) => (
          <button
            key={paper.id}
            type="button"
            onClick={() => onSelectPaper(paper.id, paper.title)}
            className="w-full rounded-xl border border-border bg-background/35 px-3 py-2 text-left transition hover:bg-accent"
          >
            <p className="text-sm font-medium text-foreground">{paper.title || paper.id}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {paper.year ? `${paper.year} • ` : ''}
              {(paper.citationCount ?? 0).toLocaleString()} citations
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ProfessorBriefPanel({ data, isLoading, onSelectPaper }: ProfessorBriefPanelProps) {
  return (
    <div className="rounded-3xl border border-border bg-card/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Professor Analysis</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {data?.professor.name ?? 'Research trajectory'}
          </h2>
        </div>
        {data ? (
          <Badge variant="outline" className="border-primary/25 bg-primary/10">
            {data.provider}
          </Badge>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Generating a RocketRide-backed professor analysis…</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Search for a professor to generate an analysis page.</p>
      ) : (
        <ScrollArea className="h-[40rem] pr-2">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-background/35 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Authored</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{data.authored_paper_count.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background/35 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Referenced</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{data.referenced_paper_count.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background/35 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Citing Them</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{data.citing_paper_count.toLocaleString()}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Orbit className="h-4 w-4 text-primary" />
                Research summary
              </div>
              <p className="text-sm leading-6 text-foreground/80">{data.research_brief}</p>
              {data.topic_names.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.topic_names.map((topic) => (
                    <Badge key={topic} variant="outline">{topic}</Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Lightbulb className="h-4 w-4 text-primary" />
                Industry impact
              </div>
              <p className="text-sm leading-6 text-foreground/80">{data.industry_impact}</p>
            </div>

            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Rocket className="h-4 w-4 text-primary" />
                How to build on the research
              </div>
              <p className="text-sm leading-6 text-foreground/80">{data.build_on_research}</p>
            </div>

            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <MessageSquareHeart className="h-4 w-4 text-primary" />
                How to approach them
              </div>
              <p className="text-sm leading-6 text-foreground/80">{data.approach_advice}</p>
            </div>

            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Lightbulb className="h-4 w-4 text-primary" />
                Future directions
              </div>
              <div className="space-y-2">
                {data.future_directions.map((direction, index) => (
                  <p key={index} className="text-sm leading-6 text-foreground/80">
                    {index + 1}. {direction}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Users className="h-4 w-4 text-primary" />
                Collaborators
              </div>
              <div className="space-y-2">
                {data.collaborators.slice(0, 5).map((collaborator) => (
                  <p key={collaborator.id} className="text-sm text-foreground/80">
                    {collaborator.name}
                    {collaborator.shared_papers ? ` • ${collaborator.shared_papers} shared papers` : ''}
                  </p>
                ))}
              </div>
            </div>

            <EvidencePaperList title="Top authored papers" papers={data.top_papers.slice(0, 6)} onSelectPaper={onSelectPaper} />
            <EvidencePaperList title="Foundational papers they cited" papers={data.referenced_papers.slice(0, 6)} onSelectPaper={onSelectPaper} />
            <EvidencePaperList title="Papers that cited them" papers={data.descendant_papers.slice(0, 6)} onSelectPaper={onSelectPaper} />
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
