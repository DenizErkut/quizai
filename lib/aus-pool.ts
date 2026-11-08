// AUS (açık uçlu soru) havuzu: açık uçlu sorular oluşturulduğunda havuza (bekleyen) düşer; yönetici ya da onaylı öğretmen onaylar/reddeder.
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export function ausFingerprint(scenario: string, question: string): string {
  return createHash('md5').update(`${scenario || ''}|${question || ''}`.replace(/\s+/g, ' ').toLowerCase()).digest('hex')
}

export type AusPoolInput = {
  source: 'student_ai' | 'teacher_assignment'
  sourceRef?: string | null
  grade?: string | null
  subject?: string | null
  topic?: string | null
  scenario: string
  question: string
  rubric: unknown
  figureSvg?: string | null
  answerTable?: string | null
}

/** Soruyu havuza ekler (aynı metin zaten varsa sessizce geçer). Hata, soru üretimini/kaydını ASLA bozmaz. */
export async function addToAusPool(db: SupabaseClient, input: AusPoolInput): Promise<void> {
  try {
    if (!input.scenario?.trim() || !input.question?.trim()) return
    await db.from('open_ended_question_pool').upsert({
      source: input.source, source_ref: input.sourceRef ?? null, grade: input.grade ?? null, subject: input.subject ?? null, topic: input.topic ?? null,
      scenario: input.scenario, question: input.question, rubric: input.rubric ?? [], figure_svg: input.figureSvg ?? null, answer_table: input.answerTable ?? null,
      fingerprint: ausFingerprint(input.scenario, input.question),
    }, { onConflict: 'fingerprint', ignoreDuplicates: true })
  } catch (error) {
    console.error('[aus-pool] eklenemedi', error instanceof Error ? error.message : error)
  }
}
