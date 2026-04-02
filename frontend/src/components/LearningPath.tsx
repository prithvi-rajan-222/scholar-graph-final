import { useEffect, useMemo, useState } from 'react'
import {
  BookMarked,
  BookOpen,
  BrainCircuit,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Telescope,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { askLearnQuestion } from '@/api/graph'
import { getErrorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { LearnPlanResult, PaperInPlan, PaperLesson } from '@/types/graph'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

interface LearningPathProps {
  data: LearnPlanResult | null | undefined
  isLoading: boolean
  show: boolean
  onClose: () => void
  onMarkRead: (paperId: string) => void
  isRead: (paperId: string) => boolean
}

interface QaTurn {
  question: string
  answer: string
}

const ROLE_CONFIG = {
  prerequisite: {
    label: 'Prerequisite',
    icon: BookOpen,
    color: 'text-blue-400',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
  target: {
    label: 'Target',
    icon: BookMarked,
    color: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  topic_anchor: {
    label: 'Key Paper',
    icon: BookMarked,
    color: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  builds_on: {
    label: 'Builds On',
    icon: Telescope,
    color: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
} as const

function PlanText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5 text-xs leading-6 text-foreground/80">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <p key={i} className="mt-3 text-sm font-semibold text-foreground first:mt-0">
              {line.replace('## ', '')}
            </p>
          )
        }
        if (line.startsWith('### ')) {
          return (
            <p key={i} className="mt-2 text-xs font-semibold text-foreground/90">
              {line.replace('### ', '')}
            </p>
          )
        }
        if (line.trim() === '') {
          return <div key={i} className="h-1" />
        }
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        return (
          <p key={i}>
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={j} className="font-semibold text-foreground">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                part
              ),
            )}
          </p>
        )
      })}
    </div>
  )
}

function PaperCard({
  paper,
  lesson,
  index,
  active,
  isRead,
  onClick,
}: {
  paper: PaperInPlan
  lesson?: PaperLesson
  index: number
  active: boolean
  isRead: boolean
  onClick: () => void
}) {
  const cfg = ROLE_CONFIG[paper.role]
  const Icon = cfg.icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-2 rounded-2xl border p-3 text-left transition',
        active
          ? 'border-primary/50 bg-primary/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]'
          : 'border-border bg-background/40 hover:border-primary/25 hover:bg-accent/60',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-[10px] font-semibold text-muted-foreground">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', cfg.color)} />
            <p className={cn('min-w-0 text-xs font-medium leading-5 text-balance', isRead && 'line-through')}>
              {paper.title || paper.id}
            </p>
          </div>
          {lesson?.lesson_title && (
            <p className="mt-1 line-clamp-2 min-w-0 text-[11px] leading-5 text-muted-foreground">
              {lesson.lesson_title}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn('h-5 border px-1.5 text-[10px]', cfg.badge)}>
            {paper.role === 'prerequisite' && paper.depth ? `Depth ${paper.depth}` : cfg.label}
          </Badge>
          {paper.year && <span className="text-[10px] text-muted-foreground">{paper.year}</span>}
        </div>
        {isRead && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />}
      </div>
    </button>
  )
}

export default function LearningPath({
  data,
  isLoading,
  show,
  onClose,
  onMarkRead,
  isRead,
}: LearningPathProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [questionDraft, setQuestionDraft] = useState('')
  const [qaByPaper, setQaByPaper] = useState<Record<string, QaTurn[]>>({})
  const [isAnswering, setIsAnswering] = useState(false)

  const papers = useMemo(() => data?.papers ?? [], [data?.papers])
  const lessons = useMemo(() => data?.curriculum ?? [], [data?.curriculum])
  const unread = papers.filter((p) => !isRead(p.id)).length
  const isSingleLesson = papers.length <= 1

  useEffect(() => {
    setActiveIndex(0)
    setQuestionDraft('')
    setQaByPaper({})
  }, [data?.target_title])

  useEffect(() => {
    if (activeIndex >= papers.length) {
      setActiveIndex(Math.max(papers.length - 1, 0))
    }
  }, [activeIndex, papers.length])

  const lessonsByPaperId = useMemo(
    () => Object.fromEntries(lessons.map((lesson) => [lesson.paper_id, lesson])),
    [lessons],
  )

  const activePaper = papers[activeIndex]
  const activeLesson = activePaper ? lessonsByPaperId[activePaper.id] : undefined
  const activeTurns = activePaper ? qaByPaper[activePaper.id] ?? [] : []
  const learnedContext = useMemo(
    () =>
      lessons
        .slice(0, activeIndex)
        .map((lesson, index) => `Lesson ${index + 1}: ${lesson.knowledge_state_after}`)
        .join('\n\n'),
    [activeIndex, lessons],
  )

  const handleAskQuestion = async () => {
    if (!data || !activePaper || !activeLesson || !questionDraft.trim()) {
      return
    }

    const question = questionDraft.trim()
    setIsAnswering(true)
    try {
      const response = await askLearnQuestion(
        data.target_title,
        activePaper,
        activeLesson,
        learnedContext,
        question,
      )
      setQaByPaper((current) => ({
        ...current,
        [activePaper.id]: [...(current[activePaper.id] ?? []), { question, answer: response.answer }],
      }))
      setQuestionDraft('')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to answer follow-up question.'))
    } finally {
      setIsAnswering(false)
    }
  }

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex h-[82vh] min-h-[680px] max-h-[92vh] flex-col overflow-hidden border-t border-border bg-card/95 backdrop-blur-2xl transition-transform duration-300',
        show ? 'translate-y-0' : 'translate-y-full',
      )}
    >
      <div className="shrink-0 border-b border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_70%)] px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-full border border-primary/20 bg-primary/10 p-2 text-primary">
              <BrainCircuit className="h-4 w-4 shrink-0" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-primary/75">Learning Mode</p>
              <h2 className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-foreground sm:text-base">
                {isLoading ? 'Building lessons…' : (data?.target_title ?? 'Learning Path')}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full border border-border bg-background/40 p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {!isLoading && data && (
          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {data.total_papers} lessons
              </Badge>
              <Badge variant="outline" className="border-primary/25 bg-primary/10 text-[10px]">
                Step {Math.min(activeIndex + 1, Math.max(data.total_papers, 1))}/{data.total_papers}
              </Badge>
              {unread > 0 && (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300">
                  {unread} unread
                </Badge>
              )}
            </div>

            {activePaper && (
              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <Button
                  variant="outline"
                  className="border-border bg-background/35"
                  onClick={() => onMarkRead(activePaper.id)}
                >
                  <BookMarked data-icon="inline-start" />
                  {isRead(activePaper.id) ? 'Unmark read' : 'Mark read'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row xl:divide-x xl:divide-border">
        <div
          className={cn(
            'flex shrink-0 flex-col border-b border-border bg-background/25 xl:min-h-0 xl:border-b-0',
            isSingleLesson ? 'xl:w-[22rem]' : 'xl:w-[20rem] 2xl:w-[22rem]',
          )}
        >
          <div className="shrink-0 border-b border-border px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Curriculum</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {isSingleLesson
                ? 'This path currently has one lesson, so the rail acts as a compact study summary.'
                : 'Move through the graph-ordered papers in sequence. Each lesson builds on the last.'}
            </p>
          </div>
          <ScrollArea className={cn('overscroll-contain xl:min-h-0 xl:flex-1', isSingleLesson ? 'max-h-56 xl:max-h-none' : 'max-h-72 xl:max-h-none')}>
            <div className={cn('grid gap-2 px-4 py-4', isSingleLesson ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-1')}>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
              ) : !data || papers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No papers found.</p>
              ) : (
                papers.map((paper, index) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    lesson={lessonsByPaperId[paper.id]}
                    index={index}
                    active={index === activeIndex}
                    isRead={isRead(paper.id)}
                    onClick={() => setActiveIndex(index)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                RocketRide is turning this reading path into a lesson sequence…
              </p>
            </div>
          ) : !data || !activePaper || !activeLesson ? (
            <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
              Learning content is not available for this path yet.
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-border px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      Lesson {activeIndex + 1}
                    </p>
                    <h3 className="mt-1 max-w-4xl text-lg font-semibold leading-tight text-foreground sm:text-[1.65rem]">
                      {activeLesson.lesson_title}
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/80">
                      {activePaper.title || activePaper.id}
                    </p>
                  </div>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1 overscroll-contain">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-5">
                  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
                    <div className="rounded-3xl border border-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_11%,transparent),transparent_55%)] p-5 sm:p-6">
                      <p className="text-sm leading-7 text-foreground/85">{activeLesson.overview}</p>
                      {activeLesson.connection_to_previous && (
                        <div className="mt-4 rounded-2xl border border-primary/20 bg-background/45 p-4">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-primary/80">
                            Connects Back
                          </p>
                          <p className="mt-2 text-sm leading-6 text-foreground/80">
                            {activeLesson.connection_to_previous}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                      <div className="rounded-3xl border border-border bg-background/35 p-4">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                          Why This Step Now
                        </p>
                        <p className="mt-2 text-sm leading-6 text-foreground/80">{activeLesson.why_now}</p>
                      </div>

                      <div className="rounded-3xl border border-border bg-background/35 p-4">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                          Key Concepts
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {activeLesson.key_concepts.map((concept) => (
                            <Badge
                              key={concept}
                              variant="outline"
                              wrap
                              className="max-w-full border-primary/20 bg-primary/10 px-2.5 text-left text-xs"
                            >
                              {concept}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-background/35 p-5 sm:p-6">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Lesson Walkthrough</p>
                    <div className="mt-4 space-y-4">
                      {activeLesson.lesson_sections.map((section) => (
                        <div key={section.heading} className="rounded-2xl border border-border bg-background/35 p-4">
                          <h4 className="text-sm font-semibold text-foreground">{section.heading}</h4>
                          <p className="mt-2 text-sm leading-7 text-foreground/80">{section.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl border border-border bg-background/35 p-5">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        Check Understanding
                      </p>
                      <p className="mt-3 text-sm leading-7 text-foreground/85">
                        {activeLesson.check_for_understanding}
                      </p>
                    </div>

                    <div className="rounded-3xl border border-border bg-background/35 p-5">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        Learning State After This Lesson
                      </p>
                      <p className="mt-3 text-sm leading-7 text-foreground/85">
                        {activeLesson.knowledge_state_after}
                      </p>
                      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                        Grounded in: {activeLesson.grounded_in}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-background/35 p-5 sm:p-6">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        Ask About This Paper
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      The answer is grounded in this paper’s lesson context and what was covered earlier in the path.
                    </p>
                    <Textarea
                      value={questionDraft}
                      onChange={(event) => setQuestionDraft(event.target.value)}
                      placeholder="Did attention solve the fixed-vector bottleneck here, or is this paper still operating before that shift?"
                      className="mt-4 min-h-24"
                    />
                    <div className="mt-3 flex justify-end">
                      <Button onClick={handleAskQuestion} disabled={isAnswering || !questionDraft.trim()}>
                        {isAnswering ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <MessageSquare data-icon="inline-start" />}
                        Ask follow-up
                      </Button>
                    </div>

                    {activeTurns.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {activeTurns.map((turn, index) => (
                          <div key={`${turn.question}-${index}`} className="rounded-2xl border border-border bg-background/40 p-4">
                            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">You asked</p>
                            <p className="mt-2 text-sm leading-6 text-foreground/85">{turn.question}</p>
                            <p className="mt-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">RocketRide answered</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground/80">{turn.answer}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-border bg-background/35 p-5 sm:p-6">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Path Rationale</p>
                    <div className="mt-3">
                      <PlanText text={data.plan} />
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-background/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <Button
                  variant="outline"
                  className="border-border bg-background/35"
                  onClick={() => setActiveIndex((current) => Math.max(current - 1, 0))}
                  disabled={activeIndex === 0}
                >
                  <ChevronLeft data-icon="inline-start" />
                  Previous
                </Button>
                <div className="text-center text-xs text-muted-foreground sm:text-left">
                  {activeIndex + 1 === papers.length
                    ? 'You are at the final paper in this learning path.'
                    : 'Advance when you feel comfortable with this paper.'}
                </div>
                <Button
                  onClick={() => setActiveIndex((current) => Math.min(current + 1, papers.length - 1))}
                  disabled={activeIndex === papers.length - 1}
                >
                  Next lesson
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
