export type AppRoute =
  | { kind: 'home' }
  | { kind: 'learning-plans' }
  | { kind: 'future-potential-home' }
  | { kind: 'professors-home' }
  | { kind: 'topic'; topic: string }
  | { kind: 'paper'; paperId: string; title?: string }
  | { kind: 'learning-plan'; subjectType: 'paper' | 'topic'; subjectId: string; title?: string }
  | { kind: 'future-potential'; topic: string }
  | { kind: 'professor'; authorId: string }

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function safeEncode(value: string): string {
  return encodeURIComponent(value)
}

export function parseRoute(locationLike: Location = window.location): AppRoute {
  const path = locationLike.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(locationLike.search)

  if (path === '/') return { kind: 'home' }
  if (path === '/learning-plans') return { kind: 'learning-plans' }
  if (path === '/future-potential') return { kind: 'future-potential-home' }
  if (path === '/professors') return { kind: 'professors-home' }

  const segments = path.split('/').filter(Boolean)

  if (segments[0] === 'topic' && segments[1]) {
    return { kind: 'topic', topic: safeDecode(segments.slice(1).join('/')) }
  }

  if (segments[0] === 'paper' && segments[1]) {
    return {
      kind: 'paper',
      paperId: safeDecode(segments[1]),
      title: params.get('title') ? safeDecode(params.get('title')!) : undefined,
    }
  }

  if (segments[0] === 'learning-plan' && segments[1] && segments[2]) {
    const subjectType = segments[1] === 'paper' ? 'paper' : 'topic'
    return {
      kind: 'learning-plan',
      subjectType,
      subjectId: safeDecode(segments.slice(2).join('/')),
      title: params.get('title') ? safeDecode(params.get('title')!) : undefined,
    }
  }

  if (segments[0] === 'future-potential' && segments[1]) {
    return { kind: 'future-potential', topic: safeDecode(segments.slice(1).join('/')) }
  }

  if (segments[0] === 'professor' && segments[1]) {
    return { kind: 'professor', authorId: safeDecode(segments[1]) }
  }

  return { kind: 'home' }
}

export function routeToUrl(route: AppRoute): string {
  switch (route.kind) {
    case 'home':
      return '/'
    case 'learning-plans':
      return '/learning-plans'
    case 'future-potential-home':
      return '/future-potential'
    case 'professors-home':
      return '/professors'
    case 'topic':
      return `/topic/${safeEncode(route.topic)}`
    case 'paper': {
      const params = new URLSearchParams()
      if (route.title) params.set('title', route.title)
      const search = params.toString()
      return `/paper/${safeEncode(route.paperId)}${search ? `?${search}` : ''}`
    }
    case 'learning-plan': {
      const params = new URLSearchParams()
      if (route.title) params.set('title', route.title)
      const search = params.toString()
      return `/learning-plan/${route.subjectType}/${safeEncode(route.subjectId)}${search ? `?${search}` : ''}`
    }
    case 'future-potential':
      return `/future-potential/${safeEncode(route.topic)}`
    case 'professor':
      return `/professor/${safeEncode(route.authorId)}`
  }
}

export function replaceRoute(route: AppRoute): void {
  window.history.replaceState(null, '', routeToUrl(route))
}

export function pushRoute(route: AppRoute): void {
  const next = routeToUrl(route)
  const current = `${window.location.pathname}${window.location.search}`
  if (next === current) return
  window.history.pushState(null, '', next)
}
