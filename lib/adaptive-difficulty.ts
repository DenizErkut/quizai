// lib/adaptive-difficulty.ts
// Faz 2 (Adaptive Test Engine) — roadmap karşılaştırma raporunun kalan açık
// maddesi. Saf, DB'ye erişmeyen fonksiyonlar — hem app/api/generate-quiz
// (başlangıç zorluğunu mastery skorundan seçmek için) hem de app/quiz/page.tsx
// ('use client', bir sonraki test parçasının zorluğunu anlık performansa göre
// hesaplamak için) tarafından kullanılabilir.
//
// Aktif kişiselleştirme oturumlarında ilk iki tanılayıcı sorudan sonraki
// sorular bu saf politika ile tek tek seçilir. Standart/öğretmen override
// oturumları aynı toplu üretim davranışını korur.

export type DifficultyValue = 'kolay' | 'normal' | 'zor' | 'cok zor'
export type AdaptiveQuestionType = 'multiple_choice' | 'true_false' | 'fill_blank' | 'matching' | 'ordering'

const LADDER: DifficultyValue[] = ['kolay', 'normal', 'zor', 'cok zor']

// İlk parçanın zorluğu — konudaki mastery skoruna (Faz 1, lib/mastery.ts)
// göre seçilir. Mastery verisi yoksa (öğrenci bu konuyu ilk kez çözüyor)
// nötr "normal" ile başlanır.
export function startingDifficultyFromMastery(masteryScore: number | null): DifficultyValue {
  if (masteryScore === null) return 'normal'
  if (masteryScore < 40) return 'kolay'
  if (masteryScore < 70) return 'normal'
  return 'zor'
}

// Bir parçadaki (chunk) performansa göre BİR SONRAKİ parçanın zorluğu.
// Roadmap: "kolay soruları hep doğru yapıyorsa zorluğu artır" /
// "zor sorularda başarısızsa geri dön" kuralı.
export function nextChunkDifficulty(
  currentDifficulty: DifficultyValue,
  chunkAnswers: { correct: boolean }[]
): DifficultyValue {
  if (chunkAnswers.length === 0) return currentDifficulty
  const correctRate = chunkAnswers.filter(a => a.correct).length / chunkAnswers.length
  const idx = LADDER.indexOf(currentDifficulty)
  if (idx === -1) return currentDifficulty

  if (correctRate >= 0.8 && idx < LADDER.length - 1) return LADDER[idx + 1]
  if (correctRate <= 0.4 && idx > 0) return LADDER[idx - 1]
  return currentDifficulty
}

// "Aynı hata tekrar ederse yeni soru yerine öğretici müdahale yap" kuralı.
// Her soru metni farklı olduğu için "aynı hata" ölçütü: art arda 2 yanlış
// cevap VE ikisi de aynı soru TİPİNDE (fill_blank, matching, vb.) — bu,
// öğrencinin belirli bir soru formatıyla/kavram türüyle zorlandığına dair
// basit ama gerçek bir sinyal.
export function shouldShowIntervention(
  recentAnswers: { correct: boolean }[],
  recentQuestionTypes: string[]
): boolean {
  const n = recentAnswers.length
  if (n < 2 || recentQuestionTypes.length < 2) return false
  const last2Wrong = !recentAnswers[n - 1].correct && !recentAnswers[n - 2].correct
  if (!last2Wrong) return false
  return recentQuestionTypes[n - 1] === recentQuestionTypes[n - 2]
}

/** Soru-bazlı v3 politikası. Üretim katmanı bunu bir sonraki soru isteğine
 * taşır; art arda hata öğrenciyi cezalandırmadan zorluğu bir kademe indirir
 * ve daha düşük bilişsel yükte bir biçime geçer. */
export function nextQuestionPolicy(
  currentDifficulty: DifficultyValue,
  recentAnswers: { correct: boolean }[],
  currentType: string,
): { difficulty: DifficultyValue; questionType: AdaptiveQuestionType; showIntervention: boolean; reason: string } {
  const recent = recentAnswers.slice(-3)
  const lastTwoWrong = recent.length >= 2 && recent.slice(-2).every(answer => !answer.correct)
  const lastThreeCorrect = recent.length >= 3 && recent.slice(-3).every(answer => answer.correct)
  const safeType: AdaptiveQuestionType = ['multiple_choice','true_false','fill_blank','matching','ordering'].includes(currentType)
    ? currentType as AdaptiveQuestionType : 'multiple_choice'
  if (lastTwoWrong) return {
    difficulty: nextChunkDifficulty(currentDifficulty, [{ correct: false }, { correct: false }]),
    questionType: safeType === 'multiple_choice' ? 'true_false' : 'multiple_choice',
    showIntervention: true,
    reason: 'Art arda iki yanlış: zorluk bir kademe düşürüldü ve soru biçimi sadeleştirildi.',
  }
  if (lastThreeCorrect) return {
    difficulty: nextChunkDifficulty(currentDifficulty, [{ correct: true }, { correct: true }, { correct: true }]),
    questionType: safeType,
    showIntervention: false,
    reason: 'Art arda üç doğru: bir sonraki soruda zorluk artırıldı.',
  }
  return { difficulty: currentDifficulty, questionType: safeType, showIntervention: false, reason: 'Dengeli performans: mevcut seviye korundu.' }
}
