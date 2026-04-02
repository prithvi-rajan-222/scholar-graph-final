import { useEffect, useMemo, useState } from 'react'
import { BookMarked, BookOpen, CheckCircle, Loader2, MessageSquare, Telescope } from 'lucide-react'
import { toast } from 'sonner'

import { askLearnQuestion, fetchLearnPaper, fetchLearningPlanHistory, fetchLearnTopic } from '@/api/graph'
import ArtifactPageLayout from '@/components/ArtifactPageLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/errors'
import type { AppRoute } from '@/lib/routes'
import { cn } from '@/lib/utils'
import type { LearnPlanResult, PaperInPlan, PaperLesson } from '@/types/graph'

interface LearningPlanPageProps {
  subjectType: 'paper' | 'topic'
  subjectId: string
  title?: string
  userId: string
  isRead: (paperId: string) => boolean
  onSetStatus: (paperId: string, status: 'read') => void
  onNavigate: (route: AppRoute) => void
  onBackHome: () => void
}

interface QaTurn {
  question: string
  answer: string
}

const ROLE_CONFIG = {
  prerequisite: { label: 'Prerequisite', icon: BookOpen, badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  target: { label: 'Target', icon: BookMarked, badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  topic_anchor: { label: 'Key Paper', icon: BookMarked, badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  builds_on: { label: 'Builds On', icon: Telescope, badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
} as const

function PlanText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-7 text-foreground/80">
      {text.split('\n').map((line, index) => {
        if (line.startsWith('## ')) {
          return <p key={index} className="mt-3 text-base font-semibold text-foreground first:mt-0">{line.replace('## ', '')}</p>
        }
        if (!line.trim()) return <div key={index} className="h-1" />
        return <p key={index}>{line}</p>
      })}
    </div>
  )
}

function LearningPaperCard({
  paper,
  active,
  lesson,
  index,
  isRead,
  onClick,
}: {
  paper: PaperInPlan
  active: boolean
  lesson?: PaperLesson
  index: number
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
        active ? 'border-primary/50 bg-primary/10' : 'border-border bg-background/35 hover:bg-accent',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-[10px] font-semibold text-muted-foreground">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p className={cn('min-w-0 text-sm font-medium leading-5', isRead && 'line-through')}>{paper.title || paper.id}</p>
          </div>
          {lesson ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{lesson.lesson_title}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('h-5 border px-1.5 text-[10px]', cfg.badge)}>
          {paper.role === 'prerequisite' && paper.depth ? `Depth ${paper.depth}` : cfg.label}
        </Badge>
        {paper.year ? <span className="text-[10px] text-muted-foreground">{paper.year}</span> : null}
        {isRead ? <CheckCircle className="ml-auto h-4 w-4 text-green-500" /> : null}
      </div>
    </button>
  )
}

export default function LearningPlanPage({
  subjectType,
  subjectId,
  title,
  userId,
  isRead,
  onSetStatus,
  onNavigate,
  onBackHome,
}: LearningPlanPageProps) {
  const [data, setData] = useState<LearnPlanResult | null>(null)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof fetchLearningPlanHistory>>['items']>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [questionDraft, setQuestionDraft] = useState('')
  const [qaByPaper, setQaByPaper] = useState<Record<string, QaTurn[]>>({})
  const [isAnswering, setIsAnswering] = useState(false)

  const load = async (options?: { refresh?: boolean; artifactId?: number }) => {
    const request =
      subjectType === 'paper'
        ? fetchLearnPaper(subjectId, { userId, refresh: options?.refresh, artifactId: options?.artifactId })
        : fetchLearnTopic(subjectId, { userId, refresh: options?.refresh, artifactId: options?.artifactId })
    const [plan, nextHistory] = await Promise.all([
      request,
      fetchLearningPlanHistory(subjectType, subjectId, userId),
    ])
    setData(plan)
    setHistory(nextHistory.items)
  }

  useEffect(() => {
    setIsLoading(true)
    setActiveIndex(0)
    setQaByPaper({})
    void load()
      .catch((error) => toast.error(getErrorMessage(error, 'Failed to load learning plan.')))
      .finally(() => setIsLoading(false))
  }, [subjectId, subjectType, userId])

  const papers = useMemo(() => data?.papers ?? [], [data?.papers])
  const lessons = useMemo(() => data?.curriculum ?? [], [data?.curriculum])
  const lessonsByPaperId = useMemo(() => Object.fromEntries(lessons.map((lesson) => [lesson.paper_id, lesson])), [lessons])
  const activePaper = papers[activeIndex]
  const activeLesson = activePaper ? lessonsByPaperId[activePaper.id] : undefined
  const activeTurns = activePaper ? qaByPaper[activePaper.id] ?? [] : []
  const learnedContext = useMemo(
    () => lessons.slice(0, activeIndex).map((lesson, index) => `Lesson ${index + 1}: ${lesson.knowledge_state_after}`).join('\n\n'),
    [activeIndex, lessons],
  )
  const navItems = useMemo(() => {
    if (subjectType !== 'topic') return [{ label: 'Learning Plan', route: { kind: 'learning-plan' as const, subjectType, subjectId, title }, active: true as const }]
    return [
      { label: 'Learning Plan', route: { kind: 'learning-plan' as const, subjectType, subjectId, title }, active: true as const },
      { label: 'Future Research Potential', route: { kind: 'future-potential' as const, topic: subjectId } },
    ]
  }, [subjectId, subjectType, title])

  const handleAsk = async () => {
    if (!data || !activePaper || !activeLesson || !questionDraft.trim()) return
    setIsAnswering(true)
    const question = questionDraft.trim()
    try {
      const response = await askLearnQuestion(data.target_title, activePaper, activeLesson, learnedContext, question)
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
    <ArtifactPageLayout
      activeNav="learning"
      eyebrow="Learning Plan"
      title={data?.target_title ?? title ?? subjectId}
      subtitle="Persisted study paths are reopened from history first, and regeneration creates a new version instead of overwriting the old one."
      provider={data?.provider}
      createdAt={data?.created_at}
      navItems={navItems}
      onNavigate={onNavigate}
      onBackHome={onBackHome}
      onRefresh={() => {
        setIsRefreshing(true)
        void load({ refresh: true })
          .catch((error) => toast.error(getErrorMessage(error, 'Failed to regenerate learning plan.')))
          .finally(() => setIsRefreshing(false))
      }}
      isRefreshing={isRefreshing}
      history={history}
      onSelectHistory={(artifactId) => {
        setIsLoading(true)
        void load({ artifactId })
          .catch((error) => toast.error(getErrorMessage(error, 'Failed to load saved learning plan.')))
          .finally(() => setIsLoading(false))
      }}
      activeArtifactId={data?.artifact_id}
    >
      {isLoading ? (
        <div className="flex items-center gap-3 rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading learning plan…</p>
        </div>
      ) : !data || !activePaper || !activeLesson ? (
        <div className="rounded-3xl border border-border bg-card/60 p-6 text-sm text-muted-foreground backdrop-blur-xl">
          Learning content is not available for this subject yet.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border bg-card/60 backdrop-blur-xl">
            <div className="border-b border-border px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Curriculum</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Move through the saved paper sequence and mark progress as you go.</p>
            </div>
            <div className="flex flex-col gap-2 p-4">
              {papers.map((paper, index) => (
                <LearningPaperCard
                  key={paper.id}
                  paper={paper}
                  lesson={lessonsByPaperId[paper.id]}
                  index={index}
                  active={index === activeIndex}
                  isRead={isRead(paper.id)}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Lesson {activeIndex + 1}</p>
              <h2 className="mt-2 text-2xl font-semibold leading-tight">{activeLesson.lesson_title}</h2>
              <p className="mt-2 text-base text-foreground/80">{activePaper.title || activePaper.id}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">{papers.length} lessons</Badge>
                <Button variant="outline" className="border-border bg-background/35" onClick={() => onSetStatus(activePaper.id, 'read')}>
                  <BookMarked data-icon="inline-start" />
                  {isRead(activePaper.id) ? 'Already marked read' : 'Mark read'}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
              <div className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
                <p className="text-base leading-8 text-foreground/85">{activeLesson.overview}</p>
                {activeLesson.connection_to_previous ? (
                  <div className="mt-5 rounded-2xl border border-primary/20 bg-background/45 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Connects Back</p>
                    <p className="mt-2 text-sm leading-7 text-foreground/80">{activeLesson.connection_to_previous}</p>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                <div className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Why This Step Now</p>
                  <p className="mt-3 text-sm leading-7 text-foreground/80">{activeLesson.why_now}</p>
                </div>
                <div className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Key Concepts</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeLesson.key_concepts.map((concept) => (
                      <Badge key={concept} variant="outline" wrap className="max-w-full border-primary/20 bg-primary/10 px-2.5 text-left text-xs">
                        {concept}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Lesson Walkthrough</p>
              <div className="mt-4 flex flex-col gap-4">
                {activeLesson.lesson_sections.map((section) => (
                  <div key={section.heading} className="rounded-2xl border border-border bg-background/35 p-4">
                    <h3 className="text-base font-semibold">{section.heading}</h3>
                    <p className="mt-2 text-sm leading-7 text-foreground/80">{section.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Check Understanding</p>
                <p className="mt-3 text-sm leading-7 text-foreground/80">{activeLesson.check_for_understanding}</p>
              </div>
              <div className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Learning State After</p>
                <p className="mt-3 text-sm leading-7 text-foreground/80">{activeLesson.knowledge_state_after}</p>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">Grounded in: {activeLesson.grounded_in}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Ask About This Paper</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Ask a follow-up grounded in this saved lesson and the earlier papers in the path.</p>
              <Textarea
                value={questionDraft}
                onChange={(event) => setQuestionDraft(event.target.value)}
                placeholder="What idea from the previous lesson does this paper depend on most?"
                className="mt-4 min-h-24"
              />
              <div className="mt-3 flex justify-end">
                <Button onClick={handleAsk} disabled={isAnswering || !questionDraft.trim()}>
                  {isAnswering ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <MessageSquare data-icon="inline-start" />}
                  Ask follow-up
                </Button>
              </div>
              {activeTurns.length > 0 ? (
                <div className="mt-4 flex flex-col gap-3">
                  {activeTurns.map((turn, index) => (
                    <div key={`${turn.question}-${index}`} className="rounded-2xl border border-border bg-background/35 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">You asked</p>
                      <p className="mt-2 text-sm leading-7 text-foreground/80">{turn.question}</p>
                      <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-primary/75">Answer</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground/80">{turn.answer}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Path Rationale</p>
              <div className="mt-4">
                <PlanText text={data.plan} />
              </div>
            </div>
          </div>
        </div>
      )}
    </ArtifactPageLayout>
  )
}
