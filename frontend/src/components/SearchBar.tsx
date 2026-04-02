import { useEffect, useRef, useState } from 'react'
import { Command as CommandIcon, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { fetchTopicPapers, searchGraph } from '@/api/graph'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/errors'
import type { Author, GraphData, Paper, SearchResults, TopicResult } from '@/types/graph'

interface SearchBarProps {
  onSelectPaper: (paper: Paper) => void
  onSelectAuthor: (author: Author) => void
  onMergeGraph: (incoming: GraphData) => void
  onLearnTopic: (topic: string) => void
  nodeCount?: number
  paperCount?: number
}

export default function SearchBar({
  onSelectPaper,
  onSelectAuthor,
  onMergeGraph,
  onLearnTopic,
  nodeCount = 0,
  paperCount = 0,
}: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults(null)
      setOpen(false)
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const data = await searchGraph(query.trim())
        setResults(data)
        setOpen(true)
      } catch (error) {
        toast.error(getErrorMessage(error, 'Search failed.'))
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query])

  const handleSelectPaper = (paper: Paper) => {
    onSelectPaper(paper)
    setQuery('')
    setOpen(false)
  }

  const handleSelectTopic = async (topic: TopicResult) => {
    try {
      const data = await fetchTopicPapers(topic.id)
      onMergeGraph(data)
      setQuery('')
      setOpen(false)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load topic papers.'))
    }
  }

  const handleLearnTopic = () => {
    const topic = query.trim()
    if (!topic) {
      return
    }

    onLearnTopic(topic)
    setOpen(false)
  }

  const hasResults = !!results && (results.papers.length > 0 || results.topics.length > 0 || results.authors.length > 0)

  return (
    <div className="sticky top-0 z-40 px-6 pb-4 pt-5">
      <div
        ref={rootRef}
        className="mx-auto w-full max-w-5xl rounded-[28px] border border-border bg-popover/90 shadow-2xl shadow-black/10 backdrop-blur-2xl"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="relative min-w-[20rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && query.trim()) {
                  event.preventDefault()
                  handleLearnTopic()
                }
              }}
              onFocus={() => {
                if (results) {
                  setOpen(true)
                }
              }}
              placeholder="Search papers, topics, and threads of research..."
              className="h-12 rounded-2xl border-border bg-background/50 pl-10 pr-4 text-sm md:text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            {query.trim() ? (
              <button
                type="button"
                onClick={handleLearnTopic}
                className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary transition hover:bg-primary/15"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Learn topic
              </button>
            ) : null}
            <div className="rounded-full border border-border bg-background/40 px-3 py-1.5">
              {nodeCount.toLocaleString()} nodes
            </div>
            <div className="rounded-full border border-border bg-background/40 px-3 py-1.5">
              {paperCount.toLocaleString()} papers loaded
            </div>
            <div className="hidden items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-primary sm:flex">
              <Sparkles className="h-3.5 w-3.5" />
              Expand by topic
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 pb-3 pt-2 text-[11px] text-muted-foreground">
          <span>Type any topic and press Enter for a plan, or click a result to explore the graph.</span>
          <span className="hidden items-center gap-1 sm:flex">
            <CommandIcon className="h-3.5 w-3.5" />
            Live search
          </span>
        </div>

        {open && (
          <div className="border-t border-border bg-popover/95 px-2 py-2">
            {isLoading ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</div>
            ) : !hasResults ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Press Enter to build a learning plan for "{query.trim()}".
              </div>
            ) : (
              <div className="grid max-h-80 gap-3 overflow-y-auto px-1 py-1 md:grid-cols-2">
                <button
                  type="button"
                  onClick={handleLearnTopic}
                  className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-left transition hover:bg-primary/15 md:col-span-2"
                >
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-[0.18em]">
                      Topic Learning Plan
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    Build a paper-backed plan for "{query.trim()}"
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    We&apos;ll find relevant papers, pull prerequisites, and draft a reading sequence.
                  </p>
                </button>

                {results && results.papers.length > 0 ? (
                  <div className="rounded-2xl border border-border bg-background/40 p-2">
                    <p className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Papers
                    </p>
                    <div className="flex flex-col gap-1">
                      {results.papers.slice(0, 8).map((paper) => (
                        <button
                          key={paper.id}
                          onClick={() => handleSelectPaper(paper)}
                          className="rounded-xl px-3 py-2 text-left transition hover:bg-accent"
                        >
                          <p className="line-clamp-2 text-sm font-medium text-foreground">{paper.title}</p>
                          {paper.year ? (
                            <p className="mt-1 text-xs text-muted-foreground">{paper.year}</p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {results && results.topics.length > 0 ? (
                  <div className="rounded-2xl border border-border bg-background/40 p-2">
                    <p className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Topics
                    </p>
                    <div className="flex flex-col gap-1">
                      {results.topics.slice(0, 6).map((topic) => (
                        <button
                          key={topic.id}
                          onClick={() => handleSelectTopic(topic)}
                          className="rounded-xl px-3 py-2 text-left transition hover:bg-accent"
                        >
                          <p className="text-sm font-medium text-foreground">{topic.name}</p>
                          {topic.paperCount != null ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {topic.paperCount.toLocaleString()} papers
                            </p>
                          ) : topic.works_count != null ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {topic.works_count.toLocaleString()} works
                            </p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {results && results.authors.length > 0 ? (
                  <div className="rounded-2xl border border-border bg-background/40 p-2 md:col-span-2">
                    <p className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Professors
                    </p>
                    <div className="grid gap-1 md:grid-cols-2">
                      {results.authors.slice(0, 6).map((author) => (
                        <button
                          key={author.id}
                          onClick={() => {
                            onSelectAuthor(author)
                            setQuery('')
                            setOpen(false)
                          }}
                          className="rounded-xl px-3 py-2 text-left transition hover:bg-accent"
                        >
                          <p className="text-sm font-medium text-foreground">{author.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {author.institution || 'Institution unknown'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
