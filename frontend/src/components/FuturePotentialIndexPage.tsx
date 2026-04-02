import TopNav from '@/components/TopNav'
import { Button } from '@/components/ui/button'
import type { AppRoute } from '@/lib/routes'

interface FuturePotentialIndexPageProps {
  featuredTopics: string[]
  onNavigate: (route: AppRoute) => void
}

export default function FuturePotentialIndexPage({ featuredTopics, onNavigate }: FuturePotentialIndexPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav active="future" onNavigate={onNavigate} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/75">Further Reading</p>
          <h1 className="mt-2 text-3xl font-semibold">What should I read next?</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Pick a topic to open the saved or latest recommendation view based on what you have already marked as read.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featuredTopics.map((topic) => (
            <div key={topic} className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-xl">
              <h2 className="text-lg font-semibold">{topic}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Open the dedicated further-reading page for this topic.
              </p>
              <div className="mt-4">
                <Button onClick={() => onNavigate({ kind: 'future-potential', topic })}>Open page</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
