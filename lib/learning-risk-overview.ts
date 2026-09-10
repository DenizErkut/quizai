import { calculateLearningRisk } from '@/lib/predictive-learning-v1'

export type MasteryRiskRow = {
  student_id: string
  subject: string
  topic: string
  mastery_score: number
  confidence_score: number
  retention_score: number
  attempt_count: number
  trend: 'improving' | 'stable' | 'declining'
  last_practiced_at: string | null
}

export type StudentClass = { id: string; name: string }

export function buildLearningRiskOverview(
  rows: MasteryRiskRow[],
  studentClasses: Map<string, StudentClass[]>,
  studentNames: Record<string, string>,
) {
  const warnings = rows.flatMap(row => {
    const risk = calculateLearningRisk({
      mastery: Number(row.mastery_score),
      retention: Number(row.retention_score),
      trend: row.trend,
      lastPracticedAt: row.last_practiced_at,
      attemptCount: row.attempt_count,
    })
    if (risk.level === 'low') return []
    const classes = studentClasses.get(row.student_id) ?? []
    return [{
      student_id: row.student_id,
      student_name: studentNames[row.student_id] || 'Öğrenci',
      classes,
      subject: row.subject,
      topic: row.topic,
      mastery: Number(row.mastery_score),
      retention: Number(row.retention_score),
      confidence: Number(row.confidence_score),
      attempt_count: row.attempt_count,
      ...risk,
    }]
  }).sort((a, b) => b.score - a.score)

  const highStudents = new Set(warnings.filter(item => item.level === 'high').map(item => item.student_id))
  const mediumStudents = new Set(warnings.filter(item => item.level === 'medium' && !highStudents.has(item.student_id)).map(item => item.student_id))

  return {
    warnings,
    counts: {
      high_students: highStudents.size,
      medium_students: mediumStudents.size,
      total_warnings: warnings.length,
    },
  }
}
