export type BlindQuestion = { q: string; opts: string[] }

export function toBlindQuestion(snapshot: unknown): BlindQuestion | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const value = snapshot as Record<string, unknown>
  if (typeof value.q !== 'string' || value.q.trim().length < 8 || !Array.isArray(value.opts)
    || value.opts.length < 2 || !value.opts.every((option): option is string => typeof option === 'string')) return null
  return { q: value.q, opts: value.opts }
}

export function isCompleteBenchmark(items: unknown, expectedCount = 50): boolean {
  if (!Array.isArray(items) || items.length !== expectedCount) return false
  return items.every(item => {
    if (!item || typeof item !== 'object') return false
    const value = item as Record<string, unknown>
    const question = toBlindQuestion(value.question_snapshot)
    const answerKey = value.answer_key
    const answerIndex = answerKey && typeof answerKey === 'object' ? (answerKey as Record<string, unknown>).answerIndex : null
    return Boolean(question && typeof answerIndex === 'number' && Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < question.opts.length)
  })
}

export function shouldUnblindResults(completedOutputs: number, reviewedOutputs: number, expectedOutputs = 150): boolean {
  return completedOutputs === expectedOutputs && reviewedOutputs === expectedOutputs
}

export function createBlindEvalPrompt(input: {
  grade: string; subject: string; objectiveCode: string; objectiveTitle: string; question: BlindQuestion
}) {
  return {
    systemPrompt: `Sen ${input.grade}. sınıf öğrencilerine soru çözen bir eğitim asistanısın. Yalnızca verilen soruya yanıt ver. Doğru cevabı yeniden hesapla; soru/kazanım kapsamından çıkma. Açıklama kısa, anlaşılır, öğrencinin yaşına uygun Türkçe olsun; öğretmen jargonu kullanma. Cevap anahtarı sana verilmemiştir. Sadece şu JSON biçiminde yanıt ver: {"answerIndex":0,"explanation":"..."}. answerIndex sıfır tabanlı seçenek numarasıdır.`,
    userPrompt: `Ders: ${input.subject}\nSınıf: ${input.grade}\nKazanım: ${input.objectiveCode} — ${input.objectiveTitle}\nSoru: ${input.question.q}\nSeçenekler:\n${input.question.opts.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n')}`,
  }
}
