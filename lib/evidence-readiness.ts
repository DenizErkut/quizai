type BankItem = { id: string; question: Record<string, unknown> }

export function verifiedQuestionInventory(rows: BankItem[]) {
  const byObjective = new Map<string, { objectiveId: string; code: string; count: number; difficulty: Record<string, number> }>()
  for (const row of rows) {
    const question = row.question
    const id = typeof question.learningObjectiveId === 'string' ? question.learningObjectiveId : ''
    if (!id || !['mapped', 'human_approved'].includes(String(question.objectiveMappingStatus)) ||
      question.objectiveVerified !== true || question.qualityVerificationVersion !== 'quiz-quality-v2') continue
    const difficulty = typeof question.difficulty === 'string' ? question.difficulty.trim().toLocaleLowerCase('tr-TR') : ''
    if (!difficulty) continue
    const current = byObjective.get(id) || { objectiveId: id, code: String(question.learningObjectiveCode || ''), count: 0, difficulty: {} }
    current.count++
    current.difficulty[difficulty] = (current.difficulty[difficulty] || 0) + 1
    byObjective.set(id, current)
  }
  return [...byObjective.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, 'tr'))
}
