export type VerifiedBankRow = { id: string; question: Record<string, unknown>; grade_key: string; subject_key: string }
export type VerifiedStage = 'baseline' | 'post' | 'transfer'
export type VerifiedItemSets = Record<VerifiedStage, string[]>

export function eligibleVerifiedItem(row: VerifiedBankRow, objectiveId: string): boolean {
  const question = row.question
  const options = question.opts
  return question.learningObjectiveId === objectiveId
    && ['mapped', 'human_approved'].includes(String(question.objectiveMappingStatus))
    && question.objectiveVerified === true
    && question.qualityVerificationVersion === 'quiz-quality-v2'
    && typeof question.q === 'string' && question.q.trim().length > 0
    && typeof question.difficulty === 'string' && question.difficulty.trim().length > 0
    && Array.isArray(options) && options.length >= 3
    && options.every(option => typeof option === 'string' && option.trim().length > 0)
    && Number.isInteger(question.ans) && Number(question.ans) >= 0 && Number(question.ans) < options.length
}

/** Each difficulty contributes the same number of distinct items to all three phases. */
export function allocateVerifiedItemSets(rows: VerifiedBankRow[], objectiveId: string): VerifiedItemSets | null {
  const seenTexts = new Set<string>()
  const groups = new Map<string, VerifiedBankRow[]>()
  for (const row of rows) {
    if (!eligibleVerifiedItem(row, objectiveId)) continue
    const text = String(row.question.q).normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
    if (seenTexts.has(text)) continue
    seenTexts.add(text)
    const difficulty = String(row.question.difficulty).trim().toLocaleLowerCase('tr-TR')
    groups.set(difficulty, [...(groups.get(difficulty) || []), row])
  }
  const sets: VerifiedItemSets = { baseline: [], post: [], transfer: [] }
  for (const group of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const capacity = Math.floor(group.length / 3)
    for (let index = 0; index < capacity && sets.baseline.length < 5; index++) {
      sets.baseline.push(group[index * 3].id)
      sets.post.push(group[index * 3 + 1].id)
      sets.transfer.push(group[index * 3 + 2].id)
    }
  }
  return sets.baseline.length === 5 ? sets : null
}

export function hasSeparatePracticeItem(rows: VerifiedBankRow[], objectiveId: string, sets: VerifiedItemSets): boolean {
  const reserved = new Set([...sets.baseline, ...sets.post, ...sets.transfer])
  const usedTexts = new Set(rows.filter(row => reserved.has(row.id)).map(row => String(row.question.q).normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()))
  return rows.some(row => eligibleVerifiedItem(row, objectiveId) && !reserved.has(row.id)
    && !usedTexts.has(String(row.question.q).normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()))
}

export function publicVerifiedQuestions(questions: Array<Record<string, unknown>>) {
  return questions.map((question, index) => ({ index, text: question.q, options: question.opts }))
}

export function scoreVerifiedAnswers(questions: Array<Record<string, unknown>>, choices: unknown) {
  if (!questions.length || !Array.isArray(choices) || choices.length !== questions.length) return null
  const answers: Array<{ userAns: number; correct: boolean; hintUsed: false }> = []
  for (let index = 0; index < questions.length; index++) {
    const options = questions[index].opts
    const choice = choices[index]
    if (!Array.isArray(options) || !Number.isInteger(choice) || choice < 0 || choice >= options.length) return null
    answers.push({ userAns: choice, correct: choice === questions[index].ans, hintUsed: false })
  }
  const score = answers.filter(answer => answer.correct).length
  return { answers, score, scorePct: Math.round(score / questions.length * 10000) / 100 }
}
