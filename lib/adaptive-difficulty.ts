// lib/adaptive-difficulty.ts
// Faz 2 (Adaptive Test Engine) — roadmap karşılaştırma raporunun kalan açık
// maddesi. Saf, DB'ye erişmeyen fonksiyonlar — hem app/api/generate-quiz
// (başlangıç zorluğunu mastery skorundan seçmek için) hem de app/quiz/page.tsx
// ('use client', bir sonraki test parçasının zorluğunu anlık performansa göre
// hesaplamak için) tarafından kullanılabilir.
//
// Tasarım notu: tam "her soruda anlık ayarlama" (soru-bazlı üretim/sunum)
// yerine, testi PARÇALARA (chunk) bölüp parça sınırında zorluğu ayarlayan bir
// v1 uygulandı — mevcut 1000+ satırlık, çok sayıda soru tipini yöneten quiz
// sayfasını riske atmadan gerçek ve test edilebilir bir adaptasyon sağlıyor.
// Tam soru-bazlı döngü, roadmap'in checklist'inde ayrı bir madde olarak
// (daha büyük bir mimari iş) açık bırakıldı.

export type DifficultyValue = 'kolay' | 'normal' | 'zor' | 'cok zor'

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
