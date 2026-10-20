// Canlı sınavda cevap kabul kuralları (saf fonksiyon, birim testlenebilir).
export interface LiveAnswerContext {
  status: string | null
  currentQuestion: number | null
  questionIndex: number
  isMember: boolean
  alreadyAnswered: boolean
}

/** Cevap reddedilecekse { error, status } döner; kabul edilecekse null. */
export function liveAnswerDecision(ctx: LiveAnswerContext): { error: string; status: number } | null {
  if (!ctx.isMember) return { error: 'Bu quiz sınıfınıza ait değil.', status: 403 }
  if (ctx.status !== 'active') return { error: 'Quiz şu an aktif değil.', status: 409 }
  if (ctx.currentQuestion === null || ctx.questionIndex !== ctx.currentQuestion) return { error: 'Bu soru artık açık değil.', status: 409 }
  if (ctx.alreadyAnswered) return { error: 'Bu soruyu zaten cevapladınız.', status: 409 }
  return null
}
