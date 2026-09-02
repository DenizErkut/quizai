import { createHash } from 'node:crypto'

interface QuestionWithMisconceptions {
  ans?: number
  opts?: string[]
  distractorMisconceptions?: Array<string | null>
}

interface QuizAnswer {
  userAns?: number
  correct?: boolean
  [key: string]: unknown
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const label = value.replace(/\s+/g, ' ').trim().slice(0, 160)
  return label.length >= 5 ? label : null
}

export function misconceptionId(subject: string, topic: string, label: string): string {
  const canonical = [subject, topic, label]
    .map(value => value.trim().toLocaleLowerCase('tr-TR'))
    .join('|')
  return `mc_${createHash('sha256').update(canonical).digest('hex').slice(0, 24)}`
}

/**
 * Models occasionally put the single null marker on a distractor and put that
 * distractor's label on the correct option. When that exact, unambiguous shape
 * occurs, swap the two slots. In every other malformed case, preserve only
 * usable labels and always clear the correct option so it can never become
 * misconception evidence.
 */
export function normalizeQuestionMisconceptions<T extends QuestionWithMisconceptions>(question: T): T {
  const optionCount = Array.isArray(question.opts) ? question.opts.length : 0
  const correctIndex = Number(question.ans)
  if (!optionCount || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= optionCount) {
    return question
  }

  const raw = Array.isArray(question.distractorMisconceptions)
    ? question.distractorMisconceptions
    : []
  const normalized = Array.from({ length: optionCount }, (_, index) => cleanLabel(raw[index]))
  const wrongNullIndexes = normalized
    .map((label, index) => ({ label, index }))
    .filter(item => item.index !== correctIndex && item.label === null)
    .map(item => item.index)

  if (normalized[correctIndex] !== null && wrongNullIndexes.length === 1) {
    normalized[wrongNullIndexes[0]] = normalized[correctIndex]
  }
  normalized[correctIndex] = null

  return { ...question, distractorMisconceptions: normalized }
}

/**
 * Attaches only model-authored distractor semantics to an incorrect answer.
 * A single observation is explicitly a suspicion, not a diagnosis; confidence
 * and confirmation are calculated later from repeated independent evidence.
 */
export function enrichAnswersWithMisconceptions(
  questions: QuestionWithMisconceptions[],
  answers: QuizAnswer[],
  subject: string,
  topic: string
): QuizAnswer[] {
  return answers.map((answer, index) => {
    if (answer.correct || !Number.isInteger(answer.userAns) || Number(answer.userAns) < 0) return answer
    const rawQuestion = questions[index]
    const selectedIndex = Number(answer.userAns)
    if (!rawQuestion) return answer
    const question = normalizeQuestionMisconceptions(rawQuestion)
    if (selectedIndex === question.ans) return answer
    const label = cleanLabel(question.distractorMisconceptions?.[selectedIndex])
    if (!label) return answer
    return {
      ...answer,
      misconceptionId: misconceptionId(subject, topic, label),
      misconceptionLabel: label,
    }
  })
}

export function misconceptionMetadataInstruction(questionType: string): string {
  if (!['multiple_choice', 'fill_blank', 'true_false', 'mixed'].includes(questionType)) return ''
  return `\n\nKAVRAM YANILGISI METADATA KURALI:\nHer multiple_choice, fill_blank ve true_false sorusuna "distractorMisconceptions" alanı ekle. Bu dizi opts ile aynı uzunlukta olsun. Doğru cevap indeksinde null yaz. Her yanlış seçenek için, o seçeneği işaretleyen öğrencinin sahip OLABİLECEĞİ özgül yanlış düşünceyi Türkçe ve en fazla 12 kelimeyle yaz. Öğrenciyi kesin biçimde teşhis etme; yalnızca seçeneğin temsil ettiği kavramsal hatayı açıkla. Rastgele hata kodu üretme.\nÖrnek: {"opts":["6","8","10","12"],"ans":1,"distractorMisconceptions":["Çevre ile alan formülünü karıştırıyor",null,"Kenar sayılarını doğrudan topluyor","Karenin alanını üç kenarla hesaplıyor"]}`
}
