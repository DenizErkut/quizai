// Türkçe dersi için kazanım türüne duyarlı soru üretim kuralları.
// Öğretmen geri bildirimi: model "metne dayalı anlam" kazanımlarında metin vermeden
// konunun önemini soruyor, yazım/noktalama kazanımlarında uygulama yerine bilgi sorusu üretiyordu.

import type { CanonicalObjectiveCandidate } from './learning-objective-mapping'

function fold(value: string): string {
  return value.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/\s+/g, ' ').trim()
}

export function isTurkishLanguageSubject(subject: string | null | undefined): boolean {
  const key = fold(subject || '')
  return key === 'turkce' || key.startsWith('turkce ') || key.startsWith('turk dili')
}

const MEANING = /(anlam|sozcuk|kelime|cumle|deyim|atasozu|soz sanat|mecaz|ses olay|anlatim|paragraf|metin|okuma|dinleme|izleme)/
const SPELLING = /(yazim|noktalama|imla|yazma kural|buyuk harf|ek(lerin)? yazimi)/
const GRAMMAR = /(dil bilgisi|sozcuk turleri|fiil|isim|sifat|zamir|zarf|edat|baglac|cekim|ek |yapi)/

export type TurkishSkill = 'spelling' | 'meaning' | 'grammar'

/** Kazanım başlıklarına ve konuya göre ölçülen beceri türlerini döndürür. */
export function turkishSkills(candidates: CanonicalObjectiveCandidate[], topic?: string | null): TurkishSkill[] {
  const text = fold([topic || '', ...candidates.map(c => c.title)].join(' | '))
  const found: TurkishSkill[] = []
  if (SPELLING.test(text)) found.push('spelling')
  if (MEANING.test(text)) found.push('meaning')
  if (GRAMMAR.test(text)) found.push('grammar')
  return found
}

export function turkishLanguagePrompt(subject: string | null | undefined, candidates: CanonicalObjectiveCandidate[], topic?: string | null): string {
  if (!isTurkishLanguageSubject(subject)) return ''
  const skills = turkishSkills(candidates, topic)
  const rules = [
    'Soru, kazanımdaki eylemi (uygulayabilme, belirleyebilme, çıkarım yapabilme vb.) öğrenciye YAPTIRMALIDIR. "Bu konunun/kuralın önemi, amacı, neden öğrenildiği, faydası" gibi konu hakkında genel bilgi soruları KESİNLİKLE üretme.',
  ]
  if (skills.includes('meaning')) rules.push(
    'Anlam kazanımları (cümlede/sözcükte anlam, paragraf, metin) için her soruda öğrenciye ÖNCE kısa bir metin, paragraf veya cümle ver (soru kökünde ya da öncülde yer alsın); soruyu bu metnin içeriğine, sözcüğün/cümlenin metindeki anlamına veya çıkarıma dayandır. Metinsiz, "anlam bilgisi nedir" türünde tanım soruları üretme.')
  if (skills.includes('spelling')) rules.push(
    'Yazım kuralları ve noktalama işaretleri kazanımları için UYGULAMA sorusu sor: içinde yazım veya noktalama hatası bulunan ya da kuralın uygulandığı örnek cümleler ver; öğrenci hatalı olanı bulsun, doğru yazımı/işareti seçsin veya cümleyi düzeltsin. Kuralın tanımını, önemini veya ezberini sorma.')
  if (skills.includes('grammar')) rules.push(
    'Dil bilgisi kazanımlarında kuralı tanım olarak değil, verilen cümle veya metin üzerinde tespit/çözümleme (hangi sözcük/ek/yapı) olarak ölç.')
  return `\n\nTÜRKÇE DERSİ SORU TÜRÜ KURALI (ZORUNLU):\n- ${rules.join('\n- ')}`
}
