import { useQuery } from '@tanstack/react-query'
import { fetchHierarchy, fetchLearningPath, fetchPaperDetail } from '@/api/graph'

export function useHierarchyGraph() {
  return useQuery({
    queryKey: ['graph', 'hierarchy'],
    queryFn: fetchHierarchy,
  })
}

export function usePaperDetail(paperId: string | null) {
  return useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => fetchPaperDetail(paperId!),
    enabled: !!paperId,
  })
}

export function useLearningPath(
  params: { topic?: string; paperId?: string; userId?: string } | null,
) {
  return useQuery({
    queryKey: ['learning-path', params],
    queryFn: () => fetchLearningPath(params?.topic, params?.paperId, params?.userId),
    enabled: !!params,
  })
}
