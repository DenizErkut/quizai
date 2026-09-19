// lib/onboarding-priorities.ts
// 19 Eylül 2026 — Deniz'in isteği: sabit "10 soruluk genel test" yerine,
// kayıt sonrası hızlı bir öz-bildirim (hedef sınav + en fazla 2 öncelik
// ders + her biri için Zayıf/Orta/İyi) alıp, bunu mevcut adaptif motora
// (lib/adaptive-difficulty.ts, lib/mastery.ts, lib/diagnostic-question-
// strategy.ts) bir BAŞLANGIÇ TOHUMU olarak veriyoruz. Gerçek mastery kanıtı
// oluşana kadar (ilk birkaç doğru/yanlış cevap) bu tohum sadece başlangıç
// zorluğunu seçer — hiçbir zaman gerçek mastery skorunun yerine geçmez,
// diagnosticQuestionStrategy hâlâ "kanıt yok" olarak davranıp foundation/
// application/misconception probe'larını üretir. Yani öz-bildirim yanlışsa
// (öğrenci kendini olduğundan iyi/kötü görürse) zarar sınırlı: sadece ilk
// 1-2 sorunun zorluğu bir kademe yanlış seçilmiş olur, hemen düzelir.
export type SelfReportLevel = 'zayif' | 'orta' | 'iyi'

export interface PrioritySubject {
  subject: string
  self_report: SelfReportLevel
}

const SELF_REPORT_SEED_SCORE: Record<SelfReportLevel, number> = {
  zayif: 30,
  orta: 55,
  iyi: 75,
}

function normalizeSubject(subject: string): string {
  return subject.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
}

// priority_subjects jsonb kolonundan gelen ham veriyi güvenli bir diziye
// çevirir — bozuk/eksik satırları sessizce eler (kullanıcıya hiçbir zaman
// bu yüzden hata göstermeyiz, sadece o veri yokmuş gibi davranırız).
export function parsePrioritySubjects(raw: unknown): PrioritySubject[] {
  if (!Array.isArray(raw)) return []
  const valid: SelfReportLevel[] = ['zayif', 'orta', 'iyi']
  return raw
    .filter((row): row is { subject: unknown; self_report: unknown } => !!row && typeof row === 'object')
    .map(row => ({ subject: String((row as any).subject || ''), self_report: (row as any).self_report as SelfReportLevel }))
    .filter(row => row.subject.length > 0 && valid.includes(row.self_report))
    .slice(0, 2)
}

// Bu ders için öğrencinin kayıt anında verdiği öz-bildirim varsa, başlangıç
// zorluğu için kullanılacak 0-100 "tohum" skoru döner. Yoksa null — çağıran
// taraf (generate-quiz) bu durumda eskisi gibi nötr 'normal' zorluğa düşer.
export function seedScoreForSubject(prioritySubjects: PrioritySubject[], subject: string): number | null {
  if (!subject) return null
  const target = normalizeSubject(subject)
  const match = prioritySubjects.find(p => normalizeSubject(p.subject) === target)
  return match ? SELF_REPORT_SEED_SCORE[match.self_report] : null
}
