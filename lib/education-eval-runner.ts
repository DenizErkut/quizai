export type BlindQuestion = { q: string; opts: string[] }

export type BlindEvalAnswer = { answerIndex: number; explanation: string }

/**
 * Providers sometimes wrap the requested JSON in prose/markdown, or return a
 * plainly labelled option. Accept only explicit, unambiguous answer markers so
 * formatting variance does not stall an otherwise valid benchmark run.
 */
export function parseBlindEvalAnswer(text: string, options: readonly string[]): BlindEvalAnswer | null {
  const optionCount = options.length
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const candidates = [cleaned]
  const jsonObject = cleaned.match(/\{[\s\S]*\}/)
  if (jsonObject?.[0] && jsonObject[0] !== cleaned) candidates.push(jsonObject[0])

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate)
      const rawAnswer = value?.answerIndex ?? value?.answer_index ?? value?.answer ?? value?.choice
      const answerIndex = typeof rawAnswer === 'number' && Number.isInteger(rawAnswer)
        ? rawAnswer
        : typeof rawAnswer === 'string' && /^\d+$/.test(rawAnswer.trim())
          ? Number(rawAnswer.trim())
          : typeof rawAnswer === 'string' && /^[A-F]$/i.test(rawAnswer.trim())
            ? rawAnswer.trim().toUpperCase().charCodeAt(0) - 65
            : typeof rawAnswer === 'string'
              ? options.findIndex(option => option.trim() === rawAnswer.trim())
              : -1
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= optionCount) continue
      return { answerIndex, explanation: typeof value.explanation === 'string' ? value.explanation.slice(0, 2000) : '' }
    } catch { /* Try the next well-bounded representation. */ }
  }

  const explicitIndex = cleaned.match(/(?:answerIndex|answer_index|cevapIndeksi)\s*[:=]\s*["']?(\d+)/i)
  if (explicitIndex) {
    const answerIndex = Number(explicitIndex[1])
    if (Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < optionCount) {
      return { answerIndex, explanation: cleaned.slice(0, 2000) }
    }
  }

  const labelledOption = cleaned.match(/^\s*(?:(?:doğru\s+)?(?:cevap|yanıt|answer|option|seçenek|şık)\s*[:\-]?\s*)?([A-F])(?:[).:\s\-]|$)/i)
  if (labelledOption) {
    const answerIndex = labelledOption[1].toUpperCase().charCodeAt(0) - 65
    if (answerIndex >= 0 && answerIndex < optionCount) {
      return { answerIndex, explanation: cleaned.slice(labelledOption[0].length).trim().slice(0, 2000) }
    }
  }

  const explicitAnswer = cleaned.match(/^\s*(?:doğru\s+)?(?:cevap|yanıt|answer|choice|seçenek|şık)\s*[:=\-]\s*["']?([^\n"']+)/i)
  if (explicitAnswer) {
    const answerIndex = options.findIndex(option => option.trim() === explicitAnswer[1].trim())
    if (answerIndex >= 0) return { answerIndex, explanation: cleaned.slice(explicitAnswer[0].length).trim().slice(0, 2000) }
  }

  return null
}

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
