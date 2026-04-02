import { z } from 'zod'

export const nodeTypeSchema = z.enum(['Paper', 'Author', 'Topic', 'Subfield', 'Field', 'Domain', 'External'])
export type NodeType = z.infer<typeof nodeTypeSchema>

const nullableString = z.preprocess((value) => value ?? undefined, z.string().optional())
const nullableNumber = z.preprocess((value) => value ?? undefined, z.number().optional())
const nullableBoolean = z.preprocess((value) => value ?? undefined, z.boolean().optional())

export const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: nodeTypeSchema,
  val: nullableNumber,
  paperCount: nullableNumber,
  year: nullableNumber,
  citationCount: nullableNumber,
  read: nullableBoolean,
  unlocked: nullableBoolean,
  inScope: nullableBoolean,
  isAuthored: nullableBoolean,
  isReferenced: nullableBoolean,
  isCiting: nullableBoolean,
  x: nullableNumber,
  y: nullableNumber,
  vx: nullableNumber,
  vy: nullableNumber,
  fx: nullableNumber,
  fy: nullableNumber,
})
export type GraphNode = z.infer<typeof graphNodeSchema>

export const graphLinkSchema = z.object({
  source: z.union([z.string(), graphNodeSchema]),
  target: z.union([z.string(), graphNodeSchema]),
  type: z.string(),
})
export type GraphLink = z.infer<typeof graphLinkSchema>

export const graphDataSchema = z.object({
  nodes: z.array(graphNodeSchema),
  links: z.array(graphLinkSchema),
})
export type GraphData = z.infer<typeof graphDataSchema>

export const paperSchema = z.object({
  id: z.string(),
  title: nullableString,
  year: nullableNumber,
  abstract: nullableString,
  citationCount: nullableNumber,
})
export type Paper = z.infer<typeof paperSchema>

export const paperStatusSchema = z.enum(['to_read', 'reading', 'read', 'skipped'])
export type PaperStatus = z.infer<typeof paperStatusSchema>

export const authorSchema = z.object({
  id: z.string(),
  name: z.string(),
  institution: nullableString,
})
export type Author = z.infer<typeof authorSchema>

export const topicSchema = z.object({
  id: nullableString,
  name: z.string(),
  score: nullableNumber,
  paperCount: nullableNumber,
})

export const paperDetailSchema = paperSchema.extend({
  authors: z.array(authorSchema),
  topics: z.array(topicSchema),
  cites: z.array(paperSchema),
  cited_by: z.array(paperSchema),
  prerequisites: z.array(paperSchema),
  status: z.preprocess((value) => value ?? undefined, paperStatusSchema.optional()),
})
export type PaperDetail = z.infer<typeof paperDetailSchema>

export const learningPathItemSchema = z.object({
  id: z.string(),
  title: nullableString,
  year: nullableNumber,
  citationCount: nullableNumber,
  depth: z.number(),
  already_read: z.boolean(),
})

export const learningPathResultSchema = z.object({
  target: z.object({
    id: z.string(),
    title: nullableString,
  }),
  learning_path: z.array(learningPathItemSchema),
  papers_to_read: z.number(),
  ai_explanation: z.string().nullable(),
})
export type LearningPathResult = z.infer<typeof learningPathResultSchema>

export const topicResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  works_count: nullableNumber,
  paperCount: nullableNumber,
})
export type TopicResult = z.infer<typeof topicResultSchema>

export const searchResultsSchema = z.object({
  papers: z.array(paperSchema),
  topics: z.array(topicResultSchema),
  authors: z.array(authorSchema.extend({
    paperCount: nullableNumber,
    totalCitations: nullableNumber,
  })).default([]),
})
export type SearchResults = z.infer<typeof searchResultsSchema>

export const paperInPlanRoleSchema = z.enum(['target', 'prerequisite', 'builds_on', 'topic_anchor'])

export const paperInPlanSchema = z.object({
  id: z.string(),
  title: nullableString,
  year: nullableNumber,
  citationCount: nullableNumber,
  abstract: nullableString,
  role: paperInPlanRoleSchema,
  depth: nullableNumber,
})
export type PaperInPlan = z.infer<typeof paperInPlanSchema>

export const lessonSectionSchema = z.object({
  heading: z.string(),
  content: z.string(),
})
export type LessonSection = z.infer<typeof lessonSectionSchema>

export const paperLessonSchema = z.object({
  paper_id: z.string(),
  lesson_title: z.string(),
  overview: z.string(),
  connection_to_previous: nullableString,
  why_now: z.string(),
  key_concepts: z.array(z.string()),
  lesson_sections: z.array(lessonSectionSchema),
  check_for_understanding: z.string(),
  knowledge_state_after: z.string(),
  grounded_in: z.string(),
})
export type PaperLesson = z.infer<typeof paperLessonSchema>

export const learnPlanResultSchema = z.object({
  artifact_id: nullableNumber,
  created_at: nullableString,
  target_title: z.string(),
  papers: z.array(paperInPlanSchema),
  plan: z.string(),
  curriculum: z.array(paperLessonSchema),
  total_papers: z.number(),
  provider: nullableString,
  model: nullableString,
  evidence_ids: z.array(z.string()).default([]),
})
export type LearnPlanResult = z.infer<typeof learnPlanResultSchema>

export const learnQuestionResponseSchema = z.object({
  answer: z.string(),
})
export type LearnQuestionResponse = z.infer<typeof learnQuestionResponseSchema>

export const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const paperStatusItemSchema = z.object({
  paper_id: z.string(),
  status: paperStatusSchema,
})
export const paperStatusListSchema = z.object({
  user_id: z.string(),
  statuses: z.array(paperStatusItemSchema),
})
export type PaperStatusList = z.infer<typeof paperStatusListSchema>

export const demoBootstrapSchema = z.object({
  user_id: z.string(),
  provider: z.string(),
  model: z.string(),
  configured: z.boolean(),
  featured_topics: z.array(z.string()),
  featured_professors: z.array(authorSchema.extend({
    paperCount: nullableNumber,
    totalCitations: nullableNumber,
  })),
})
export type DemoBootstrap = z.infer<typeof demoBootstrapSchema>

export const topicMasterySchema = z.object({
  topic: z.string(),
  provider: z.string(),
  model: z.string(),
  configured: z.boolean(),
  anchors: z.array(paperInPlanSchema),
  study_plan: z.string(),
  evidence_ids: z.array(z.string()),
})
export type TopicMastery = z.infer<typeof topicMasterySchema>

export const recommendationEvidenceSchema = z.object({
  paper_id: z.string(),
  relation: z.string(),
  note: nullableString,
})
export const recommendationItemSchema = z.object({
  paper: paperSchema,
  reason: z.string(),
  reason_code: z.string(),
  evidence: z.array(recommendationEvidenceSchema),
})
export const recommendationResponseSchema = z.object({
  artifact_id: nullableNumber,
  created_at: nullableString,
  user_id: z.string(),
  context: z.string(),
  provider: z.string(),
  model: z.string(),
  items: z.array(recommendationItemSchema),
})
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>

export const professorBriefSchema = z.object({
  artifact_id: nullableNumber,
  created_at: nullableString,
  professor: authorSchema,
  provider: z.string(),
  model: z.string(),
  configured: z.boolean(),
  research_brief: z.string(),
  industry_impact: z.string().default(''),
  build_on_research: z.string().default(''),
  approach_advice: z.string().default(''),
  future_directions: z.array(z.string()),
  evidence_ids: z.array(z.string()),
  top_papers: z.array(paperSchema),
  timeline: z.array(paperSchema),
  topic_names: z.array(z.string()),
  collaborators: z.array(z.object({
    id: z.string(),
    name: z.string(),
    institution: nullableString,
    shared_papers: nullableNumber,
  })),
  descendant_papers: z.array(paperSchema),
  referenced_papers: z.array(paperSchema).default([]),
  authored_paper_count: z.number().default(0),
  referenced_paper_count: z.number().default(0),
  citing_paper_count: z.number().default(0),
})
export type ProfessorBrief = z.infer<typeof professorBriefSchema>

export const generatedArtifactHistoryItemSchema = z.object({
  id: z.number(),
  artifact_type: z.string(),
  subject_type: z.string(),
  subject_id: z.string(),
  created_at: nullableString,
  provider: z.string(),
  model: z.string(),
})
export const generatedArtifactHistorySchema = z.object({
  items: z.array(generatedArtifactHistoryItemSchema),
})
export type GeneratedArtifactHistory = z.infer<typeof generatedArtifactHistorySchema>
export type GeneratedArtifactHistoryItem = z.infer<typeof generatedArtifactHistoryItemSchema>

export const generatedArtifactCatalogItemSchema = z.object({
  id: z.number(),
  artifact_type: z.string(),
  subject_type: z.string(),
  subject_id: z.string(),
  created_at: nullableString,
  provider: z.string(),
  model: z.string(),
  title: nullableString,
})
export const generatedArtifactCatalogSchema = z.object({
  items: z.array(generatedArtifactCatalogItemSchema),
})
export type GeneratedArtifactCatalog = z.infer<typeof generatedArtifactCatalogSchema>
