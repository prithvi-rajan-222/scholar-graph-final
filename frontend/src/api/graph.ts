import { apiDelete, apiGet, apiPost } from './client'
import {
  demoBootstrapSchema,
  generatedArtifactCatalogSchema,
  generatedArtifactHistorySchema,
  graphDataSchema,
  learnPlanResultSchema,
  learningPathResultSchema,
  learnQuestionResponseSchema,
  paperDetailSchema,
  paperStatusListSchema,
  professorBriefSchema,
  recommendationResponseSchema,
  searchResultsSchema,
  successResponseSchema,
  topicMasterySchema,
  type DemoBootstrap,
  type GeneratedArtifactCatalog,
  type GeneratedArtifactHistory,
  type GraphData,
  type LearnPlanResult,
  type LearnQuestionResponse,
  type LearningPathResult,
  type PaperDetail,
  type PaperStatus,
  type PaperStatusList,
  type PaperInPlan,
  type PaperLesson,
  type ProfessorBrief,
  type RecommendationResponse,
  type SearchResults,
  type TopicMastery,
} from '@/types/graph'

export const fetchHierarchy = (): Promise<GraphData> =>
  apiGet('/graph/hierarchy', graphDataSchema)

export const fetchTopicPapers = (topicId: string): Promise<GraphData> =>
  apiGet(`/graph/topic/${encodeURIComponent(topicId)}/papers`, graphDataSchema)

export const fetchScopePapers = (
  nodeType: 'Topic' | 'Subfield' | 'Field' | 'Domain',
  nodeId: string,
): Promise<GraphData> =>
  apiGet(`/graph/scope/${nodeType.toLowerCase()}/${encodeURIComponent(nodeId)}/papers`, graphDataSchema)

export const fetchPaperDetail = (paperId: string): Promise<PaperDetail> =>
  apiGet(`/graph/paper/${encodeURIComponent(paperId)}`, paperDetailSchema)

export const fetchPaperNeighbors = (paperId: string): Promise<GraphData> =>
  apiGet(`/graph/paper/${encodeURIComponent(paperId)}/neighbors`, graphDataSchema)

export const fetchAuthorNetwork = (authorId: string): Promise<GraphData> =>
  apiGet(`/graph/author/${encodeURIComponent(authorId)}/network`, graphDataSchema)

export const searchGraph = (q: string): Promise<SearchResults> =>
  apiGet(`/graph/search?q=${encodeURIComponent(q)}`, searchResultsSchema)

export const fetchLearningPath = (
  topic?: string,
  paperId?: string,
  userId?: string,
): Promise<LearningPathResult> => {
  const params = new URLSearchParams()
  if (topic) params.set('topic', topic)
  if (paperId) params.set('paper_id', paperId)
  if (userId) params.set('user_id', userId)
  return apiGet(`/graph/learning-path?${params.toString()}`, learningPathResultSchema)
}

export const markAsRead = async (userId: string, paperId: string): Promise<void> => {
  await apiPost('/user/read', { user_id: userId, paper_id: paperId }, successResponseSchema)
}

export const unmarkAsRead = async (userId: string, paperId: string): Promise<void> => {
  await apiDelete('/user/read', { user_id: userId, paper_id: paperId }, successResponseSchema)
}

export const fetchUserGraph = (userId: string): Promise<GraphData> =>
  apiGet(`/user/${encodeURIComponent(userId)}/graph`, graphDataSchema).catch(() =>
    apiGet('/user/graph', graphDataSchema),
  )

export const fetchPaperStatuses = (userId: string): Promise<PaperStatusList> =>
  apiGet(`/demo/paper-status?user_id=${encodeURIComponent(userId)}`, paperStatusListSchema)

export const setPaperStatus = (userId: string, paperId: string, status: PaperStatus): Promise<PaperStatusList> =>
  apiPost('/demo/paper-status', { user_id: userId, paper_id: paperId, status }, paperStatusListSchema)

export const fetchLearnPaper = (
  paperId: string,
  options?: { userId?: string; refresh?: boolean; artifactId?: number },
): Promise<LearnPlanResult> => {
  const params = new URLSearchParams()
  if (options?.userId) params.set('user_id', options.userId)
  if (options?.refresh) params.set('refresh', '1')
  if (options?.artifactId != null) params.set('artifact_id', String(options.artifactId))
  const suffix = params.toString()
  return apiGet(`/learn/paper/${encodeURIComponent(paperId)}${suffix ? `?${suffix}` : ''}`, learnPlanResultSchema)
}

export const fetchLearnTopic = (
  topic: string,
  options?: { userId?: string; refresh?: boolean; artifactId?: number },
): Promise<LearnPlanResult> => {
  const params = new URLSearchParams()
  params.set('topic', topic)
  if (options?.userId) params.set('user_id', options.userId)
  if (options?.refresh) params.set('refresh', '1')
  if (options?.artifactId != null) params.set('artifact_id', String(options.artifactId))
  return apiGet(`/learn/topic?${params.toString()}`, learnPlanResultSchema)
}

export const fetchLearningPlanHistory = (
  subjectType: 'paper' | 'topic',
  subjectId: string,
  userId: string,
): Promise<GeneratedArtifactHistory> =>
  apiGet(
    `/learn/history?subject_type=${encodeURIComponent(subjectType)}&subject_id=${encodeURIComponent(subjectId)}&user_id=${encodeURIComponent(userId)}`,
    generatedArtifactHistorySchema,
  )

export const askLearnQuestion = (
  targetTitle: string,
  paper: PaperInPlan,
  lesson: PaperLesson,
  learnedContext: string,
  question: string,
): Promise<LearnQuestionResponse> =>
  apiPost(
    '/learn/question',
    {
      target_title: targetTitle,
      paper,
      lesson,
      learned_context: learnedContext,
      question,
    },
    learnQuestionResponseSchema,
  )

export const fetchDemoBootstrap = (): Promise<DemoBootstrap> =>
  apiGet('/demo/bootstrap', demoBootstrapSchema)

export const fetchTopicMastery = (topic: string): Promise<TopicMastery> =>
  apiGet(`/demo/topic-mastery?topic=${encodeURIComponent(topic)}`, topicMasterySchema)

export const fetchRecommendations = (
  topic: string | undefined,
  userId: string,
  options?: { refresh?: boolean; artifactId?: number },
): Promise<RecommendationResponse> => {
  const params = new URLSearchParams()
  params.set('user_id', userId)
  if (topic) params.set('topic', topic)
  if (options?.refresh) params.set('refresh', '1')
  if (options?.artifactId != null) params.set('artifact_id', String(options.artifactId))
  return apiGet(`/demo/recommendations?${params.toString()}`, recommendationResponseSchema)
}

export const fetchProfessorBrief = (
  authorId: string,
  userId: string,
  options?: { refresh?: boolean; artifactId?: number },
): Promise<ProfessorBrief> => {
  const params = new URLSearchParams()
  params.set('user_id', userId)
  if (options?.refresh) params.set('refresh', '1')
  if (options?.artifactId != null) params.set('artifact_id', String(options.artifactId))
  return apiGet(`/demo/professors/${encodeURIComponent(authorId)}/brief?${params.toString()}`, professorBriefSchema)
}

export const fetchProfessorSearch = (q: string): Promise<DemoBootstrap['featured_professors']> =>
  apiGet(`/demo/professors/search?q=${encodeURIComponent(q)}`, searchResultsSchema.shape.authors)

export const fetchArtifactHistory = (
  artifactType: string,
  subjectType: string,
  subjectId: string,
  userId: string,
): Promise<GeneratedArtifactHistory> =>
  apiGet(
    `/demo/artifacts/history?artifact_type=${encodeURIComponent(artifactType)}&subject_type=${encodeURIComponent(subjectType)}&subject_id=${encodeURIComponent(subjectId)}&user_id=${encodeURIComponent(userId)}`,
    generatedArtifactHistorySchema,
  )

export const fetchArtifactCatalog = (
  artifactType: string,
  userId: string,
): Promise<GeneratedArtifactCatalog> =>
  apiGet(
    `/demo/artifacts/catalog?artifact_type=${encodeURIComponent(artifactType)}&user_id=${encodeURIComponent(userId)}`,
    generatedArtifactCatalogSchema,
  )
