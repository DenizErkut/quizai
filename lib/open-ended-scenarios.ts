// Açık Uçlu "senaryo kartları": sınıf + ders + dönem + senaryo numarası. Yönetici örnek yükler, yapay zeka benzerini üretir.
import { gradeNumberOf } from './written-exam'

export type ScenarioRubricItem = { criterion: string; maxPoints: number; description: string }
export type ScenarioExampleInput = {
  gradeNumber: number; subject: string; term: number; scenarioNo: number
  title: string; scenario: string; question: string; rubric: ScenarioRubricItem[]
}
export const SCENARIO_RUBRIC_TOTAL = 100

export const scenarioLabel = (term: number, no: number) => `${term}. dönem ${no}. senaryo`

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\r/g, '').trim().slice(0, max) : '')

export function validateScenarioExample(input: Record<string, unknown>):
  { ok: true; value: ScenarioExampleInput } | { ok: false; error: string } {
  const gradeNumber = gradeNumberOf(input.gradeNumber)
  const subject = clean(input.subject, 120)
  const term = Number(input.term)
  const scenarioNo = Number(input.scenarioNo)
  if (!gradeNumber) return { ok: false, error: 'Sınıf seçin (1-12).' }
  if (subject.length < 2) return { ok: false, error: 'Ders adı gerekli.' }
  if (term !== 1 && term !== 2) return { ok: false, error: 'Dönem 1 veya 2 olmalı.' }
  if (!Number.isInteger(scenarioNo) || scenarioNo < 1 || scenarioNo > 99) return { ok: false, error: 'Senaryo numarası 1-99 arası olmalı.' }
  const scenario = clean(input.scenario, 4000)
  const question = clean(input.question, 2000)
  if (scenario.length < 10) return { ok: false, error: 'Senaryo metni çok kısa.' }
  if (question.length < 5) return { ok: false, error: 'Soru metni çok kısa.' }
  const rubricInput = Array.isArray(input.rubric) ? input.rubric as Array<Record<string, unknown>> : []
  if (rubricInput.length < 1 || rubricInput.length > 10) return { ok: false, error: 'Rubrik 1-10 ölçütten oluşmalı.' }
  const rubric: ScenarioRubricItem[] = []
  for (const entry of rubricInput) {
    const criterion = clean(entry?.criterion, 300)
    const maxPoints = Number(entry?.maxPoints)
    if (!criterion) return { ok: false, error: 'Rubrik ölçütünün adı boş.' }
    if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 100) return { ok: false, error: `"${criterion}" ölçütünün puanı 1-100 arası tam sayı olmalı.` }
    rubric.push({ criterion, maxPoints, description: clean(entry?.description, 800) })
  }
  const total = rubric.reduce((sum, item) => sum + item.maxPoints, 0)
  if (total !== SCENARIO_RUBRIC_TOTAL) return { ok: false, error: `Rubrik toplamı ${SCENARIO_RUBRIC_TOTAL} olmalı (şu an ${total}).` }
  return { ok: true, value: { gradeNumber, subject, term, scenarioNo, title: clean(input.title, 200), scenario, question, rubric } }
}

/** Yönetici örneklerini yapay zeka istemine koyar: örneği kopyalamak değil, aynı beceriyi ölçen yeni bir senaryo yazmak istenir. */
export function exampleBlock(examples: Array<{ scenario: string; question: string; rubric: ScenarioRubricItem[] }>): string {
  return examples.map((example, index) => `ÖRNEK ${index + 1}:
Senaryo: ${example.scenario}
Soru: ${example.question}
Rubrik: ${example.rubric.map(item => `${item.criterion} (${item.maxPoints} puan): ${item.description}`).join(' | ')}`).join('\n\n')
}

export function pickExamples<T>(examples: T[], count: number, random: () => number = Math.random): T[] {
  const pool = [...examples]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}
