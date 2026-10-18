// Kazanım kodu/ID'si olmayan soru onaylı stoğa alınamaz; yalnızca kaynağı zaten
// öğretmen/AI kitapçığı olarak ayrıca imzalanmış (exact) sorular bu kuralın dışındadır.
export function canApproveWithoutObjective(question: unknown): boolean {
  const policy = (question as { sourcePolicy?: unknown } | null)?.sourcePolicy
  return policy === 'teacher_exact' || policy === 'ai_exact'
}
