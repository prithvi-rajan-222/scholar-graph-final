import { useEffect, useRef, useState } from 'react'
import { Loader2, Search, UserRoundSearch } from 'lucide-react'
import { toast } from 'sonner'

import { fetchProfessorSearch } from '@/api/graph'
import TopNav from '@/components/TopNav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getErrorMessage } from '@/lib/errors'
import type { AppRoute } from '@/lib/routes'
import type { DemoBootstrap } from '@/types/graph'

interface ProfessorIndexPageProps {
  bootstrap: DemoBootstrap | null
  onNavigate: (route: AppRoute) => void
}

export default function ProfessorIndexPage({ bootstrap, onNavigate }: ProfessorIndexPageProps) {
  const professors = bootstrap?.featured_professors ?? []
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DemoBootstrap['featured_professors']>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setIsSearching(false)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const nextResults = await fetchProfessorSearch(trimmed)
        setResults(nextResults)
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to search professors.'))
      } finally {
        setIsSearching(false)
      }
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const displayedProfessors = query.trim() ? results : professors

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav active="professors" onNavigate={onNavigate} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Professor Analysis</p>
          <h1 className="mt-2 text-3xl font-semibold">Search a professor and map their influence</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Open a professor page to see authored papers in blue, cited foundations in amber, and downstream citing papers in green, alongside a practical analysis of their work and how to approach them.
          </p>

          <div className="relative mt-5 max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search professors by name..."
              className="h-12 rounded-2xl border-border bg-background/50 pl-10"
            />
            {isSearching ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" /> : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displayedProfessors.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-border bg-card/60 p-6 text-sm text-muted-foreground backdrop-blur-xl">
              {query.trim() ? `No professors matched "${query.trim()}".` : 'Use professor search from the graph home to open an analysis page.'}
            </div>
          ) : (
            displayedProfessors.map((professor) => (
              <div key={professor.id} className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{professor.name}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{professor.institution || 'Institution unknown'}</p>
                  </div>
                  <UserRoundSearch className="h-5 w-5 text-primary" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {(professor.paperCount ?? 0).toLocaleString()} papers • {(professor.totalCitations ?? 0).toLocaleString()} citations
                </p>
                <div className="mt-4">
                  <Button onClick={() => onNavigate({ kind: 'professor', authorId: professor.id })}>Open analysis</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
