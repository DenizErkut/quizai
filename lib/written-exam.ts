// "Yazılıya Hazırlanıyorum": yönetici yüklediği hazır açık uçlu soru setleri ve öğrenci akışı için ortak türler/doğrulama.
// Yapay zeka bu akışta soru üretmez; yalnızca yüklenen metni yapılandırır ve cevapları rubriğe göre puanlar.
import { extractGradeNumber } from './subject-map-grade'

export type RubricCriterion = { criterion: string; maxPoints: number; description: string }
export type WrittenQuestionDraft = {
  position: number
  title: string
  objectiveCode: string
  scenario: string
  question: string
  maxPoints: number
  rubric: RubricCriterion[]
  answerKey: string
}
export type SetSlot = { gradeNumber: number; subject: string; term: number; examNumber: number }

export const TERM_LABELS: Record<number, string> = { 1: '1. dönem', 2: '2. dönem' }
export const MAX_QUESTIONS = 40
const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\r/g, '').trim().slice(0, max) : '')

export function rubricTotal(rubric: Array<{ maxPoints: number }>): number {
  return rubric.reduce((sum, item) => sum + (Number(item.maxPoints) || 0), 0)
}

/** Sınıf etiketinden ("6. sınıf", "6") sayı çıkarır; geçersizse null. */
export function gradeNumberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null
  const parsed = extractGradeNumber(typeof value === 'string' ? value : '')
  return parsed && parsed >= 1 && parsed <= 12 ? parsed : null
}

export function validateSlot(input: { gradeNumber?: unknown; subject?: unknown; term?: unknown; examNumber?: unknown }):
  { ok: true; value: SetSlot } | { ok: false; error: string } {
  const gradeNumber = gradeNumberOf(input.gradeNumber)
  const subject = clean(input.subject, 120)
  const term = Number(input.term)
  const examNumber = Number(input.examNumber)
  if (!gradeNumber) return { ok: false, error: 'Sınıf seçin (1-12).' }
  if (subject.length < 2) return { ok: false, error: 'Ders adı gerekli.' }
  if (term !== 1 && term !== 2) return { ok: false, error: 'Dönem 1 veya 2 olmalı.' }
  if (!Number.isInteger(examNumber) || examNumber < 1 || examNumber > 4) return { ok: false, error: 'Kaçıncı yazılı olduğu 1-4 arasında olmalı.' }
  return { ok: true, value: { gradeNumber, subject, term, examNumber } }
}

/** Yönetici düzenlemesinden gelen ya da AI'ın yapılandırdığı soru listesini doğrular; kayıt için hata varsa durur. */
export function validateQuestions(raw: unknown): { ok: true; questions: WrittenQuestionDraft[]; totalPoints: number } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length < 1) return { ok: false, error: 'En az bir soru gerekli.' }
  if (raw.length > MAX_QUESTIONS) return { ok: false, error: `En fazla ${MAX_QUESTIONS} soru yüklenebilir.` }
  const questions: WrittenQuestionDraft[] = []
  for (let index = 0; index < raw.length; index++) {
    const item = raw[index] as Record<string, unknown> | null
    const label = `${index + 1}. soru`
    const question = clean(item?.question, 4000)
    if (question.length < 3) return { ok: false, error: `${label}: soru metni boş.` }
    const rubricInput = Array.isArray(item?.rubric) ? item.rubric as Array<Record<string, unknown>> : []
    if (rubricInput.length < 1 || rubricInput.length > 20) return { ok: false, error: `${label}: rubrik 1-20 ölçütten oluşmalı.` }
    const rubric: RubricCriterion[] = []
    for (const entry of rubricInput) {
      const maxPoints = Number(entry?.maxPoints)
      const criterion = clean(entry?.criterion, 300)
      if (!criterion) return { ok: false, error: `${label}: rubrik ölçütünün adı boş.` }
      if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 100) return { ok: false, error: `${label}: "${criterion}" ölçütünün puanı 1-100 arası tam sayı olmalı.` }
      rubric.push({ criterion, maxPoints, description: clean(entry?.description, 1200) })
    }
    const maxPoints = Number(item?.maxPoints)
    const total = rubricTotal(rubric)
    if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 100) return { ok: false, error: `${label}: puan 1-100 arası tam sayı olmalı.` }
    if (total !== maxPoints) return { ok: false, error: `${label}: rubrik toplamı (${total}) soru puanına (${maxPoints}) eşit olmalı.` }
    questions.push({
      position: index + 1,
      title: clean(item?.title, 200),
      objectiveCode: clean(item?.objectiveCode, 60),
      scenario: clean(item?.scenario, 4000),
      question,
      maxPoints,
      rubric,
      answerKey: clean(item?.answerKey, 4000),
    })
  }
  return { ok: true, questions, totalPoints: questions.reduce((sum, q) => sum + q.maxPoints, 0) }
}

/** AI çıktısını yönetici incelemesi için yumuşak biçimde toparlar: hata atmaz, sorunları uyarı olarak döner. */
export function normalizeParsedQuestions(raw: unknown): { questions: WrittenQuestionDraft[]; warnings: string[] } {
  const list = Array.isArray(raw) ? raw : []
  const warnings: string[] = []
  const questions = list.slice(0, MAX_QUESTIONS).map((entry, index): WrittenQuestionDraft => {
    const item = (entry || {}) as Record<string, unknown>
    const rubricInput = Array.isArray(item.rubric) ? item.rubric as Array<Record<string, unknown>> : []
    const rubric = rubricInput.map(r => ({
      criterion: clean(r?.criterion, 300), maxPoints: Math.round(Number(r?.maxPoints) || 0), description: clean(r?.description, 1200),
    })).filter(r => r.criterion)
    const total = rubricTotal(rubric)
    const maxPoints = Math.round(Number(item.maxPoints) || 0) || total
    if (!rubric.length) warnings.push(`${index + 1}. soru: rubrik çıkarılamadı, elle ekleyin.`)
    else if (total !== maxPoints) warnings.push(`${index + 1}. soru: rubrik toplamı (${total}) soru puanından (${maxPoints}) farklı.`)
    return {
      position: index + 1, title: clean(item.title, 200), objectiveCode: clean(item.objectiveCode, 60), scenario: clean(item.scenario, 4000),
      question: clean(item.question, 4000), maxPoints, rubric, answerKey: clean(item.answerKey, 4000),
    }
  })
  if (!questions.length) warnings.push('Dosyadan soru çıkarılamadı.')
  return { questions, warnings }
}

export type ItemResult = { questionId: string; maxPoints: number; earned: number | null }
/** Tamamlanan sorulara göre toplam puan ve yüzde. earned=null: henüz cevaplanmamış (0 sayılır). */
export function summarizeResults(items: ItemResult[]): { totalEarned: number; totalPossible: number; answered: number; percent: number } {
  const totalPossible = items.reduce((sum, item) => sum + item.maxPoints, 0)
  const totalEarned = items.reduce((sum, item) => sum + Math.min(item.maxPoints, Math.max(0, item.earned ?? 0)), 0)
  return { totalEarned, totalPossible, answered: items.filter(item => item.earned !== null).length, percent: totalPossible ? Math.round((totalEarned / totalPossible) * 100) : 0 }
}
