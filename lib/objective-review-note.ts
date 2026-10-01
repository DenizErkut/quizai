const genericWords = new Set([
  'aciklama', 'anlama', 'asama', 'basari', 'bilgi', 'cevap', 'cocuk', 'dogru',
  'durum', 'egitim', 'gerek', 'gore', 'ifade', 'ilgili', 'kapsam', 'kazanim',
  'konu', 'mantik', 'ogrenci', 'olcum', 'olcer', 'olcme', 'olctugu', 'ornek',
  'secenek', 'sinif', 'soru', 'tablo', 'temel', 'uygun', 'uyum', 'verilen',
  'veriler', 'yanit', 'yanlis', 'yapilan', 'yerine', 'yontem',
])

function words(value: string): string[] {
  return value.toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, letter => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[letter] || letter)
    .match(/[a-z]{4,}/g)?.filter(word => !genericWords.has(word)) || []
}

/** Human approval needs at least one concrete anchor from this question or outcome. */
export function noteMatchesObjectiveReview(note: string, questionText: string, explanation: string, objectiveTitle = ''): boolean {
  const anchors = words(`${questionText} ${explanation} ${objectiveTitle}`)
  if (!anchors.length) return false
  return words(note).some(word => anchors.some(anchor => word === anchor || (word.length >= 6 && anchor.length >= 6 && word.slice(0, 5) === anchor.slice(0, 5))))
}
