import { SupabaseClient } from '@supabase/supabase-js'

export interface LearningProfileTopic {
  subject: string
  topic: string
  mastery: number
  confidence?: number
  trend?: 'improving' | 'stable' | 'declining'
  lastPracticedAt?: string
}

export interface StudentLearningProfile {
  studentId: string
  grade: string | null
  strongTopics: LearningProfileTopic[]
  weakTopics: LearningProfileTopic[]
  reviewTopics: LearningProfileTopic[]
  knownMisconceptions: string[]
  subjectSummary: Array<{
    subject: string
    averageMastery: number
    averageConfidence: number
    topicCount: number
  }>
  learningPace: 'unknown' | 'fast' | 'medium' | 'deliberate'
  recentTrend: 'improving' | 'stable' | 'declining'
  evidenceEventCount: number
  masteryDimensionCount: number
  profileVersion: string
  updatedAt: string
}

interface LearningProfileRow {
  student_id: string
  grade: string | null
  strong_topics: LearningProfileTopic[] | null
  weak_topics: LearningProfileTopic[] | null
  review_topics: LearningProfileTopic[] | null
  known_misconceptions: string[] | null
  subject_summary: StudentLearningProfile['subjectSummary'] | null
  learning_pace: StudentLearningProfile['learningPace']
  recent_trend: StudentLearningProfile['recentTrend']
  evidence_event_count: number
  mastery_dimension_count: number
  profile_version: string
  updated_at: string
}

export async function getStudentLearningProfile(
  supabase: SupabaseClient,
  studentId: string
): Promise<StudentLearningProfile | null> {
  const { data } = await supabase
    .from('student_learning_profiles')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle()

  if (!data) return null
  const row = data as unknown as LearningProfileRow
  return {
    studentId: row.student_id,
    grade: row.grade,
    strongTopics: row.strong_topics || [],
    weakTopics: row.weak_topics || [],
    reviewTopics: row.review_topics || [],
    knownMisconceptions: row.known_misconceptions || [],
    subjectSummary: row.subject_summary || [],
    learningPace: row.learning_pace,
    recentTrend: row.recent_trend,
    evidenceEventCount: row.evidence_event_count,
    masteryDimensionCount: row.mastery_dimension_count,
    profileVersion: row.profile_version,
    updatedAt: row.updated_at,
  }
}
